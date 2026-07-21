import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from '../config.js'

// Local voice → text for the Telegram bot. Nothing leaves the machine.
//
// Two backends, auto-detected at boot (prefer the faster one):
//   • whisper.cpp  — needs the `whisper-cli` binary + a ggml model FILE. We feed
//     it 16kHz mono WAV (converted from Telegram's OGG/Opus via ffmpeg).
//   • openai-whisper (Python CLI) — the `whisper` command; accepts the .ogg
//     directly (it shells out to ffmpeg itself). Slower, zero extra setup.

const pexec = promisify(execFile)
const tmpRoot = path.join(os.tmpdir(), 'mc-voice')

let backend = null // 'whispercpp' | 'python' | null
let detail = ''

// "Runs" = the binary exists (didn't ENOENT). A non-zero exit from -h/--help
// still means it's installed, so we only treat a missing executable as absent.
async function binRuns(bin, args) {
  try {
    await pexec(bin, args, { timeout: 8000 })
    return true
  } catch (e) {
    const msg = String(e?.message || '')
    return e?.code !== 'ENOENT' && !msg.includes('ENOENT')
  }
}

function modelIsFile() {
  try { return fs.statSync(config.whisperModel).isFile() } catch { return false }
}

export async function detectBackend() {
  await fsp.mkdir(tmpRoot, { recursive: true }).catch(() => {})
  // whisper.cpp only makes sense when we also have a model file for it.
  if (modelIsFile() && (await binRuns(config.whisperBin, ['-h']))) {
    backend = 'whispercpp'
    detail = `whisper.cpp (${config.whisperBin})`
  } else if (await binRuns('whisper', ['--help'])) {
    backend = 'python'
    detail = `openai-whisper · model ${config.whisperModel}`
  } else {
    backend = null
    detail = ''
  }
  return backendInfo()
}

export function backendInfo() {
  return { available: !!backend, backend, detail }
}

// Transcribe an audio file (Telegram voice notes are OGG/Opus) to plain text.
export async function transcribe(audioPath) {
  if (!backend) return { ok: false, error: 'no local transcription backend' }
  const lang = config.whisperLang && config.whisperLang !== 'auto' ? config.whisperLang : null
  const work = await fsp.mkdtemp(path.join(tmpRoot, 'job-'))
  try {
    if (backend === 'whispercpp') {
      const wav = path.join(work, 'a.wav')
      await pexec(config.ffmpegBin, ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-f', 'wav', wav], { timeout: 60_000 })
      const outPrefix = path.join(work, 'a') // whisper-cli writes <prefix>.txt
      const args = ['-m', config.whisperModel, '-f', wav, '-otxt', '-nt', '-of', outPrefix, '-l', config.whisperLang || 'auto']
      await pexec(config.whisperBin, args, { timeout: 180_000 })
      const text = await fsp.readFile(outPrefix + '.txt', 'utf8').catch(() => '')
      return { ok: true, text: text.trim() }
    }
    // python openai-whisper — writes <input-basename>.txt into --output_dir.
    const args = [audioPath, '--model', config.whisperModel, '--output_format', 'txt', '--output_dir', work, '--fp16', 'False', '--verbose', 'False']
    if (lang) args.push('--language', lang)
    await pexec('whisper', args, { timeout: 300_000 })
    const base = path.basename(audioPath).replace(/\.[^.]+$/, '')
    const text = await fsp.readFile(path.join(work, base + '.txt'), 'utf8').catch(() => '')
    return { ok: true, text: text.trim() }
  } catch (e) {
    return { ok: false, error: String(e?.stderr || e?.message || e).slice(0, 300) }
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
