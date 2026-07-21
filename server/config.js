import os from 'node:os'
import path from 'node:path'

const home = os.homedir()

export const config = {
  port: Number(process.env.MC_PORT) || 4600,

  // Where Claude Code writes its live registry + transcripts.
  claudeDir: path.join(home, '.claude'),
  sessionsDir: path.join(home, '.claude', 'sessions'),
  projectsDir: path.join(home, '.claude', 'projects'),

  // A session is considered dead if its registry file hasn't been touched in this long.
  staleMs: 45_000,

  // How long a "just finished" badge/notification stays hot after a session goes idle.
  justFinishedMs: 120_000,

  // Debounce for coalescing a burst of registry writes into one snapshot push.
  snapshotDebounceMs: 250,

  // Notification anti-spam.
  notifyCooldownMs: 10_000,   // per session + transition
  notifyCoalesceMs: 2_000,    // burst window -> single summary
  startupGraceMs: 4_000,      // seed state on boot without notifying

  // Prefix for tmux sessions the hub owns.
  tmuxPrefix: 'cc_',
  tmuxBin: process.env.MC_TMUX || 'tmux',
  claudeBin: process.env.MC_CLAUDE || 'claude',

  // Local voice transcription for the Telegram bot (drive terminals by voice).
  // Two backends are auto-detected: whisper.cpp (fast; needs a ggml model) or the
  // Python `openai-whisper` CLI (slower; accepts the .ogg directly). Both are
  // fully local — nothing leaves the machine.
  whisperBin: process.env.MC_WHISPER || 'whisper-cli', // whisper.cpp binary if present
  whisperModel: process.env.MC_WHISPER_MODEL || 'base', // ggml path (cpp) or model name (python)
  whisperLang: process.env.MC_WHISPER_LANG || 'auto', // 'auto' detects; or a code like 'en' / 'pt'
  ffmpegBin: process.env.MC_FFMPEG || 'ffmpeg',
}
