import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { WebSocketServer } from 'ws'

import { config } from './config.js'
import { RegistryWatcher } from './registry/watcher.js'
import { TranscriptStore } from './transcript/tailer.js'
import { StateEngine, State } from './state/engine.js'
import { Notifier } from './notify/notifier.js'
import { sendTelegram, detectChatId, getBotInfo, getUpdates, setCommands, getFile, downloadFile, sendChatAction, editMessage } from './notify/telegram.js'
import { TmuxManager } from './pty/tmuxManager.js'
import { detectBackend as detectVoiceBackend, backendInfo as voiceInfo, transcribe } from './voice/transcribe.js'
import { gitDiffStat } from './git/diffStat.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

const registry = new RegistryWatcher()
const transcripts = new TranscriptStore()
const engine = new StateEngine()
const tmux = new TmuxManager()

// Persisted settings (notification channels, etc). Loaded on boot; the Notifier
// reads the current Telegram config live via the getter below.
const settingsFile = path.join(config.claudeDir, 'oversee-settings.json')
let settings = { telegram: { enabled: false, token: '', chatId: '' } }
async function loadSettings() {
  try {
    const obj = JSON.parse(await fsp.readFile(settingsFile, 'utf8'))
    if (obj && typeof obj === 'object') settings = { ...settings, ...obj, telegram: { ...settings.telegram, ...obj.telegram } }
  } catch { /* defaults */ }
  // Environment overrides (handy for headless / CI).
  if (process.env.MC_TG_TOKEN) settings.telegram.token = process.env.MC_TG_TOKEN
  if (process.env.MC_TG_CHAT) settings.telegram.chatId = process.env.MC_TG_CHAT
  if (process.env.MC_TG_TOKEN && process.env.MC_TG_CHAT) settings.telegram.enabled = true
}
async function saveSettings() {
  try { await fsp.writeFile(settingsFile, JSON.stringify(settings, null, 2)) } catch {}
}

const notifier = new Notifier(() => settings.telegram)

let latest = { sessions: [], tmuxAvailable: false, hubSessions: [] }
const titleBySession = new Map()

// ---- Telegram two-way control ----------------------------------------------
// A single long-poll loop (started at boot) that reads settings live: it idles
// when Telegram is disabled and polls getUpdates when enabled. From the linked
// chat you can drive a hub-owned terminal — plain text (and voice notes) get
// typed into the current target and the bot replies with a snapshot of the pane.
const TG_COMMANDS = [
  { command: 'sessions', description: 'List drivable terminals' },
  { command: 'use', description: 'Pick the terminal to drive: /use <n>' },
  { command: 'follow', description: 'Live-stream a terminal: /follow <n>' },
  { command: 'unfollow', description: 'Stop the live stream' },
  { command: 'peek', description: 'Show the current terminal screen' },
  { command: 'enter', description: 'Press Enter in the terminal' },
  { command: 'status', description: 'Fleet summary + current target' },
  { command: 'task', description: 'Add a task to the inbox' },
  { command: 'tasks', description: 'List open tasks' },
  { command: 'help', description: 'Show commands' },
]
const TG_HELP = [
  '<b>oversee</b> — drive your terminals',
  '',
  '<code>/sessions</code>  list terminals',
  '<code>/use &lt;n&gt;</code>  pick which to drive',
  'send any text → typed in + Enter',
  '🎤 voice note → transcribed, then typed in',
  '<code>/follow &lt;n&gt;</code>  live-stream the screen · <code>/unfollow</code>',
  '<code>/peek</code>  show the screen once',
  '<code>/enter /esc /up /down</code>  press a key',
  '<code>/key &lt;name&gt;</code>  e.g. C-c, Tab',
  '',
  '<code>/task &lt;text&gt;</code>  add to inbox · <code>/tasks</code> · <code>/status</code>',
].join('\n')
// Slash-command → tmux key name for the one-tap keys.
const TG_KEYMAP = { '/enter': 'Enter', '/esc': 'Escape', '/up': 'Up', '/down': 'Down', '/left': 'Left', '/right': 'Right', '/tab': 'Tab' }

let tgOffset = 0
let tgCommandsFor = ''
let tgTarget = null       // tmuxName currently being driven
let tgSessionList = []     // last /sessions ordering, so /use <n> resolves to a name
let tgFollow = null        // live view: { name, chatId, messageId, cwdName, lastText, timer }
const FOLLOW_MS = 2500     // how often the live view refreshes
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Hub-owned (typeable) sessions, from the live snapshot the refresh loop builds.
function drivableSessions() {
  return (latest.sessions || [])
    .filter((s) => s.hubOwned && s.tmuxName)
    .map((s) => ({ name: s.tmuxName, cwdName: s.cwdName || s.cwd || s.tmuxName, state: s.state }))
}

// The current target's tmux name, or null. Drops a target that has gone away and
// auto-adopts the sole session so a single-agent setup needs no /use.
async function resolveTarget() {
  const list = drivableSessions()
  if (tgTarget && !list.some((s) => s.name === tgTarget)) tgTarget = null
  if (!tgTarget && list.length === 1) tgTarget = list[0].name
  if (!tgTarget) return null
  if (!(await tmux.has(tgTarget))) { tgTarget = null; return null }
  return tgTarget
}

function noTargetHint(token, chatId) {
  const msg = drivableSessions().length
    ? 'No target selected. Send /sessions then <code>/use &lt;n&gt;</code>.'
    : 'No drivable sessions. Launch one from the oversee app first.'
  return sendTelegram(token, chatId, msg).catch(() => {})
}

// Trim trailing blank lines, keep the last n, cap length for Telegram.
function tail(text, n) {
  const out = String(text).replace(/\s+$/, '').split('\n').slice(-n).join('\n')
  return out.length > 3500 ? '…' + out.slice(-3500) : out
}

// Reply with a snapshot of the pane a moment after acting, so you see the result.
// Skipped when a live /follow view of the same pane is already updating.
function peekReply(token, chatId, name, delay = 2500) {
  if (tgFollow && tgFollow.name === name) return
  setTimeout(async () => {
    const body = tail(await tmux.capturePlain(name), 30)
    if (body) sendTelegram(token, chatId, `<pre>${esc(body)}</pre>`).catch(() => {})
  }, delay)
}

// ---- live follow: stream a pane by editing one message in place --------------
function followView(cwdName, body) {
  return `📺 <b>${esc(cwdName)}</b>\n<pre>${esc(body || '(blank screen)')}</pre>`
}

function stopFollow(note) {
  if (!tgFollow) return
  clearInterval(tgFollow.timer)
  const { chatId } = tgFollow
  tgFollow = null
  if (note) sendTelegram(settings.telegram.token, chatId, note).catch(() => {})
}

async function startFollow(token, chatId, name, cwdName) {
  stopFollow()
  const body = tail(await tmux.capturePlain(name), 30)
  const sent = await sendTelegram(token, chatId, followView(cwdName, body))
  if (!sent.ok || !sent.messageId) return sendTelegram(token, chatId, 'Could not start following.').catch(() => {})
  tgFollow = { name, chatId, messageId: sent.messageId, cwdName, lastText: body, timer: null }
  tgFollow.timer = setInterval(() => followTick().catch(() => {}), FOLLOW_MS)
}

// Poll the followed pane; edit the live message only when its content changed.
async function followTick() {
  if (!tgFollow) return
  const { name, chatId, messageId, cwdName } = tgFollow
  if (!(await tmux.has(name))) return stopFollow(`📺 <b>${esc(cwdName)}</b> ended — stopped following.`)
  const body = tail(await tmux.capturePlain(name), 30)
  if (body === tgFollow.lastText) return
  tgFollow.lastText = body
  editMessage(settings.telegram.token, chatId, messageId, followView(cwdName, body)).catch(() => {})
}

// Type text into the current target and schedule a snapshot.
async function driveText(token, chatId, text) {
  const name = await resolveTarget()
  if (!name) return noTargetHint(token, chatId)
  await tmux.sendPrompt(name, text)
  peekReply(token, chatId, name)
}

// Voice note → local transcription → drive the target.
async function handleVoice(voice, token, chatId, reply) {
  const v = voiceInfo()
  if (!v.available) return reply('🎤 Voice needs a local transcriber. Install <code>openai-whisper</code> (or whisper.cpp) — see the README.')
  if (voice.duration && voice.duration > 120) return reply('🎤 That voice note is too long (max ~2 min).')
  if (!(await resolveTarget())) return noTargetHint(token, chatId)
  sendChatAction(token, chatId, 'typing')
  await reply('🎤 transcribing…')
  const f = await getFile(token, voice.file_id)
  if (!f.ok) return reply('Could not fetch the voice note.')
  const dest = path.join(os.tmpdir(), 'mc-voice', `dl-${voice.file_unique_id || Date.now()}.oga`)
  await fsp.mkdir(path.dirname(dest), { recursive: true }).catch(() => {})
  const dl = await downloadFile(token, f.filePath, dest)
  if (!dl.ok) return reply('Could not download the voice note.')
  const tr = await transcribe(dest)
  fsp.rm(dest, { force: true }).catch(() => {})
  if (!tr.ok || !tr.text) return reply(`Transcription failed${tr.error ? `: <code>${esc(tr.error)}</code>` : '.'}`)
  await reply(`🎤 <i>${esc(tr.text)}</i>`)
  const target = await resolveTarget() // may have died mid-transcription
  if (!target) return noTargetHint(token, chatId)
  await tmux.sendPrompt(target, tr.text)
  peekReply(token, chatId, target)
}

async function handleTgMessage(msg) {
  const tg = settings.telegram
  const chatId = msg?.chat?.id
  if (chatId == null || String(chatId) !== String(tg.chatId)) return // only the linked chat
  const token = tg.token
  const reply = (t) => sendTelegram(token, chatId, t).catch(() => {})

  if (msg.voice) return handleVoice(msg.voice, token, chatId, reply)

  const text = (msg.text || '').trim()
  if (!text) return
  if (!text.startsWith('/')) return driveText(token, chatId, text) // plain msg drives the terminal

  const sp = text.indexOf(' ')
  const cmd = (sp === -1 ? text : text.slice(0, sp)).toLowerCase().replace(/@.*$/, '')
  const arg = sp === -1 ? '' : text.slice(sp + 1).trim()

  if (cmd === '/sessions') {
    const list = (tgSessionList = drivableSessions())
    if (!list.length) return reply('No drivable sessions. Launch one from the oversee app.')
    const cur = await resolveTarget()
    const lines = list.map((s, i) => `${s.name === cur ? '●' : `${i + 1}.`} ${esc(s.cwdName)} · ${s.state}`)
    return reply('<b>Terminals</b>\n' + lines.join('\n') + '\n\nPick one: <code>/use &lt;n&gt;</code>')
  }
  if (cmd === '/use') {
    const list = (tgSessionList = tgSessionList.length ? tgSessionList : drivableSessions())
    if (!list.length) return reply('No drivable sessions yet.')
    const n = Number(arg)
    let pick = Number.isInteger(n) && n >= 1 && n <= list.length ? list[n - 1] : null
    if (!pick && arg) pick = list.find((s) => s.cwdName.toLowerCase().includes(arg.toLowerCase()) || s.name.includes(arg))
    if (!pick) return reply('Usage: <code>/use &lt;number&gt;</code> — see <code>/sessions</code>.')
    tgTarget = pick.name
    return reply(`Driving <b>${esc(pick.cwdName)}</b>. Send a message (or voice) and it types in.`)
  }
  if (cmd === '/peek') {
    const name = await resolveTarget()
    if (!name) return noTargetHint(token, chatId)
    const body = tail(await tmux.capturePlain(name), 34)
    return reply(body ? `<pre>${esc(body)}</pre>` : '(blank screen)')
  }
  if (cmd === '/follow') {
    const list = (tgSessionList = tgSessionList.length ? tgSessionList : drivableSessions())
    let name, cwdName
    if (arg) {
      const n = Number(arg)
      const pick = Number.isInteger(n) && n >= 1 && n <= list.length
        ? list[n - 1]
        : list.find((s) => s.cwdName.toLowerCase().includes(arg.toLowerCase()) || s.name.includes(arg))
      if (!pick) return reply('Usage: <code>/follow &lt;number&gt;</code> — see <code>/sessions</code>.')
      tgTarget = name = pick.name
      cwdName = pick.cwdName
    } else {
      name = await resolveTarget()
      if (!name) return noTargetHint(token, chatId)
      cwdName = drivableSessions().find((d) => d.name === name)?.cwdName || name
    }
    return startFollow(token, chatId, name, cwdName)
  }
  if (cmd === '/unfollow' || cmd === '/stop') {
    if (!tgFollow) return reply('Not following anything.')
    return stopFollow('📺 stopped following.')
  }
  if (TG_KEYMAP[cmd] || cmd === '/key') {
    const key = TG_KEYMAP[cmd] || arg
    const name = await resolveTarget()
    if (!name) return noTargetHint(token, chatId)
    if (!(await tmux.sendSpecial(name, key))) return reply(`Unknown key <code>${esc(key)}</code>.`)
    return peekReply(token, chatId, name, 1200)
  }

  if (cmd === '/task' || cmd === '/add') {
    if (!arg) return reply('Usage: <code>/task what to do</code>')
    const t = addTask(arg)
    return reply(`✅ Added to inbox:\n<b>${esc(t.text)}</b>`)
  }
  if (cmd === '/tasks') {
    const open = tasks.filter((t) => t.status !== 'done')
    if (!open.length) return reply('Inbox is empty.')
    return reply('<b>Inbox</b>\n' + open.map((t) => `${t.status === 'in_progress' ? '⏳' : '▫️'} ${esc(t.text)}`).join('\n'))
  }
  if (cmd === '/status') {
    const s = latest.sessions || []
    const w = s.filter((x) => x.state === 'waiting').length
    const r = s.filter((x) => x.state === 'working').length
    const cur = await resolveTarget()
    const curName = cur ? drivableSessions().find((d) => d.name === cur)?.cwdName || cur : '—'
    const v = voiceInfo()
    const following = tgFollow ? `<b>${esc(tgFollow.cwdName)}</b>` : 'off'
    return reply(
      `<b>oversee</b>\n🔴 ${w} waiting · ▶️ ${r} running · ${s.length} session${s.length === 1 ? '' : 's'}` +
      `\n🎛 driving: <b>${esc(curName)}</b>\n📺 following: ${following}\n🎤 voice: ${v.available ? esc(v.detail) : 'off (no whisper)'}`,
    )
  }
  if (cmd === '/help' || cmd === '/start') return reply(TG_HELP)
  return reply('Unknown command. Try <code>/help</code>.')
}

async function telegramLoop() {
  for (;;) {
    const tg = settings.telegram
    if (!tg.enabled || !tg.token) { await sleep(2000); continue }
    if (tgCommandsFor !== tg.token) { tgCommandsFor = tg.token; setCommands(tg.token, TG_COMMANDS) }
    const upd = await getUpdates(tg.token, tgOffset, 25)
    if (upd.ok) {
      for (const u of upd.result) {
        tgOffset = u.update_id + 1
        try { await handleTgMessage(u.message || u.edited_message) } catch { /* ignore one bad update */ }
      }
    } else {
      await sleep(3000) // back off on error (bad token, 409, network)
    }
  }
}

// "Recently done" feed: bounded log of turns completed since the hub started.
const hubStartedAt = Date.now()
const doneFeed = [] // newest first, { ts, sessionId, project, title, files }
const DONE_FEED_MAX = 30

// Task inbox (Akiflow-style): drag a task onto an agent to dispatch it.
const tasksFile = path.join(config.claudeDir, 'mission-control-tasks.json')
let tasks = [] // { id, text, createdAt }
let taskSeq = 0
async function loadTasks() {
  try {
    const arr = JSON.parse(await fsp.readFile(tasksFile, 'utf8'))
    if (Array.isArray(arr)) { tasks = arr; taskSeq = arr.reduce((m, t) => Math.max(m, t.id || 0), 0) }
  } catch { tasks = [] }
}
async function saveTasks() {
  try { await fsp.writeFile(tasksFile, JSON.stringify(tasks, null, 2)) } catch {}
}
// Create a task in the inbox (used by the HTTP API and the Telegram bot).
function addTask(text) {
  const task = { id: ++taskSeq, text: String(text).trim(), status: 'todo', agent: null, createdAt: Date.now() }
  tasks.push(task)
  saveTasks(); broadcastTasks()
  return task
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function broadcastTasks() {
  latest = { ...latest, tasks }
  broadcastControl({ type: 'snapshot', ...latest })
}

// ---- core refresh loop: registry -> state -> transcripts -> broadcast --------
async function refresh(entries) {
  const now = Date.now()
  const { sessions, transitions } = await engine.derive(entries, now)

  // Enrich each live session with transcript-derived content.
  await Promise.all(
    sessions
      .filter((s) => s.state !== State.DEAD && s.cwd)
      .map(async (s) => {
        await transcripts.update(s.cwd, s.sessionId)
        const v = transcripts.view(s.sessionId)
        if (v) {
          Object.assign(s, v)
          if (v.title) titleBySession.set(s.sessionId, v.title)
        }
        s.cwdName = path.basename(s.cwd)
        // Fold any newly-completed turns into the recently-done feed.
        for (const _turn of transcripts.drainNewTurns(s.sessionId)) {
          doneFeed.unshift({
            ts: now,
            sessionId: s.sessionId,
            project: s.cwdName,
            title: v?.title || v?.lastPrompt || s.cwdName,
            files: v?.filesCount ?? 0,
          })
        }
      }),
  )
  if (doneFeed.length > DONE_FEED_MAX) doneFeed.length = DONE_FEED_MAX

  // Join hub-owned tmux sessions so the UI can offer an embedded terminal.
  const hub = tmux.available ? await tmux.list() : []
  const hubByCwd = new Map(hub.map((h) => [h.cwd, h]))
  for (const s of sessions) {
    const h = hubByCwd.get(s.cwd)
    if (h) {
      s.hubOwned = true
      s.tmuxName = h.name
    }
  }

  notifier.handleTransitions(transitions, (sid) => titleBySession.get(sid))
  const overview = {
    hubStartedAt,
    doneFeed: doneFeed.slice(0, DONE_FEED_MAX),
  }
  latest = { sessions, tmuxAvailable: tmux.available, hubSessions: hub, overview, tasks, ts: now }
  broadcastControl({ type: 'snapshot', ...latest })

  // Drop per-session state for sessions that have left the registry so the stores
  // don't grow without bound over a long-running hub. (notifier ran above while
  // titleBySession still held any just-vanished session, so titles aren't lost.)
  const liveIds = new Set(sessions.map((s) => s.sessionId))
  transcripts.retain(liveIds)
  for (const sid of titleBySession.keys()) if (!liveIds.has(sid)) titleBySession.delete(sid)
  notifier.retain(liveIds)
}

// Single-flight the refresh: it fires from the file watcher, a steady tick, and
// launch/kill, and each run spawns child processes (tmux/ps) + awaits disk reads.
// Without a guard, runs pile up faster than they finish under load — child-process
// and buffer pileup that climbs until the heap OOMs. Coalesce instead: at most one
// in flight, with a single trailing run if requests arrived while it was busy.
let refreshing = false
let refreshQueued = false
function requestRefresh() {
  if (refreshing) { refreshQueued = true; return }
  refreshing = true
  refresh(registry.entries)
    .catch((e) => console.error('refresh', e))
    .finally(() => {
      refreshing = false
      if (refreshQueued) { refreshQueued = false; requestRefresh() }
    })
}

registry.on('change', () => requestRefresh())

// Also refresh on a steady tick so token counts / activity update while a
// session is mid-turn (its registry file heartbeats, but we want fresh content).
setInterval(requestRefresh, 1500)

// Memory watchdog. --max-old-space-size caps the V8 heap, but native allocations
// (child-process stdout buffers, sockets) can still climb. As a last-resort guard
// against starving the whole machine, sample RSS and exit cleanly past a hard
// ceiling — far better than dragging macOS into swap. The Electron shell restarts
// us and surfaces the reason; a terminal `npm start` prints it and stops.
const RSS_WARN = 700 * 1024 * 1024
const RSS_LIMIT = 1500 * 1024 * 1024
const memWatch = setInterval(() => {
  const mb = (n) => (n / 1048576) | 0
  const { rss } = process.memoryUsage()
  if (rss > RSS_LIMIT) {
    console.error(`[oversee] RSS ${mb(rss)} MB over limit — exiting to protect the system.`)
    process.exit(137)
  } else if (rss > RSS_WARN) {
    console.warn(`[oversee] high memory: RSS ${mb(rss)} MB`)
  }
}, 10_000)
memWatch.unref?.()

// ---- HTTP: static UI + JSON API ---------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url)
  return serveStatic(url.pathname, res)
})

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/snapshot') return json(res, latest)

    if (url.pathname === '/api/git') {
      const cwd = url.searchParams.get('cwd')
      if (!cwd) return json(res, { error: 'cwd required' }, 400)
      return json(res, await gitDiffStat(cwd))
    }

    if (url.pathname === '/api/projects') {
      // Recent cwds to offer in the launch dialog (from the projects dir).
      return json(res, await recentCwds())
    }

    // Browse the filesystem for the folder picker.
    if (url.pathname === '/api/fs') {
      return json(res, await listDir(url.searchParams.get('path')))
    }
    if (url.pathname === '/api/mkdir' && req.method === 'POST') {
      const body = await readBody(req)
      const name = String(body?.name || '').replace(/[/\\]/g, '').trim()
      if (!body?.path || !name) return json(res, { error: 'path and name required' }, 400)
      const target = path.join(body.path, name)
      try {
        await fsp.mkdir(target, { recursive: false })
        return json(res, { ok: true, path: target })
      } catch (e) {
        return json(res, { error: String(e?.message || e) }, 400)
      }
    }

    if (url.pathname === '/api/launch' && req.method === 'POST') {
      const body = await readBody(req)
      const cwd = body?.cwd
      if (!cwd) return json(res, { error: 'cwd required' }, 400)
      if (!tmux.available) return json(res, { error: 'tmux not available' }, 400)
      const info = await tmux.launch(cwd, body.cols || 120, body.rows || 32)
      requestRefresh()
      return json(res, { ok: true, ...info })
    }

    if (url.pathname === '/api/kill' && req.method === 'POST') {
      const body = await readBody(req)
      return json(res, await killSession(body))
    }

    // Task inbox.
    if (url.pathname === '/api/tasks/add' && req.method === 'POST') {
      const body = await readBody(req)
      const text = String(body?.text || '').trim()
      if (!text) return json(res, { error: 'text required' }, 400)
      return json(res, addTask(text))
    }
    if (url.pathname === '/api/tasks/update' && req.method === 'POST') {
      const body = await readBody(req)
      const t = tasks.find((x) => x.id === body?.id)
      if (t) {
        if (typeof body.status === 'string') t.status = body.status
        if ('agent' in body) t.agent = body.agent
        if ('agentTmux' in body) t.agentTmux = body.agentTmux
        if (typeof body.text === 'string' && body.text.trim()) t.text = body.text.trim()
        await saveTasks(); broadcastTasks()
      }
      return json(res, { ok: true })
    }
    if (url.pathname === '/api/tasks/remove' && req.method === 'POST') {
      const body = await readBody(req)
      tasks = tasks.filter((t) => t.id !== body?.id)
      await saveTasks(); broadcastTasks()
      return json(res, { ok: true })
    }

    // Send a quick prompt to a hub-owned session (types the text + Enter).
    if (url.pathname === '/api/send' && req.method === 'POST') {
      const body = await readBody(req)
      if (!body?.tmuxName || typeof body.text !== 'string') {
        return json(res, { error: 'tmuxName and text required' }, 400)
      }
      if (!tmux.available) return json(res, { error: 'tmux not available' }, 400)
      await tmux.sendPrompt(body.tmuxName, body.text)
      return json(res, { ok: true })
    }

    // Reveal a session's folder in the OS file manager (Finder / Explorer / xdg).
    if (url.pathname === '/api/reveal' && req.method === 'POST') {
      const body = await readBody(req)
      const dir = body?.cwd
      if (!dir || typeof dir !== 'string') return json(res, { error: 'cwd required' }, 400)
      try {
        const st = await fsp.stat(dir)
        if (!st.isDirectory()) return json(res, { error: 'not a directory' }, 400)
      } catch {
        return json(res, { error: 'folder not found' }, 404)
      }
      const opener = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'explorer' : 'xdg-open'
      await new Promise((resolve) => execFile(opener, [dir], () => resolve()))
      return json(res, { ok: true })
    }

    // Settings (notification channels). Returns the current config for the UI.
    if (url.pathname === '/api/settings' && req.method === 'GET') {
      return json(res, settings)
    }
    if (url.pathname === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req)
      const tg = body?.telegram || {}
      settings.telegram = {
        enabled: !!tg.enabled,
        token: typeof tg.token === 'string' ? tg.token.trim() : settings.telegram.token,
        chatId: typeof tg.chatId === 'string' ? tg.chatId.trim() : settings.telegram.chatId,
      }
      await saveSettings()
      return json(res, settings)
    }

    // Telegram helpers: auto-detect the chat id and send a test message. Uses the
    // token/chatId from the request if given, else the saved ones.
    if (url.pathname === '/api/telegram/detect' && req.method === 'POST') {
      const body = await readBody(req)
      const token = (body?.token || settings.telegram.token || '').trim()
      return json(res, await detectChatId(token))
    }
    if (url.pathname === '/api/telegram/test' && req.method === 'POST') {
      const body = await readBody(req)
      const token = (body?.token || settings.telegram.token || '').trim()
      const chatId = (body?.chatId || settings.telegram.chatId || '').trim()
      const info = await getBotInfo(token)
      if (!info.ok) return json(res, info)
      const r = await sendTelegram(token, chatId, '🔔 <b>oversee</b>\nTelegram notifications are connected.')
      return json(res, r.ok ? { ok: true, bot: info.username } : r)
    }

    return json(res, { error: 'not found' }, 404)
  } catch (e) {
    return json(res, { error: String(e?.message || e) }, 500)
  }
}

async function recentCwds() {
  // Live-session cwds are exact; slug-derived ones are lossy, so we only keep
  // reconstructions that actually exist on disk (drops garbage/ambiguous paths).
  const exact = new Set()
  for (const s of latest.sessions) if (s.cwd) exact.add(s.cwd)
  const candidates = new Set()
  try {
    const dirs = await fsp.readdir(config.projectsDir)
    for (const d of dirs) {
      if (d.startsWith('-')) candidates.add('/' + d.slice(1).replace(/-/g, '/'))
    }
  } catch {}
  await Promise.all(
    [...candidates].map(async (p) => {
      if (exact.has(p)) return
      try {
        const st = await fsp.stat(p)
        if (st.isDirectory()) exact.add(p)
      } catch {
        /* not a real path — skip */
      }
    }),
  )
  return [...exact].sort()
}

// List sub-folders of a directory for the folder picker. Defaults to home.
async function listDir(dir) {
  const home = os.homedir()
  const abs = path.resolve(dir || home)
  try {
    const items = await fsp.readdir(abs, { withFileTypes: true })
    const folders = items
      .filter((d) => {
        try { return (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('.') } catch { return false }
      })
      .map((d) => d.name)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    const fileCount = items.filter((d) => d.isFile() && !d.name.startsWith('.')).length
    const parent = path.dirname(abs)
    return { path: abs, parent: parent === abs ? null : parent, home, folders, fileCount }
  } catch (e) {
    return { error: String(e?.message || e), path: abs, home, folders: [], parent: path.dirname(abs) }
  }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

// Close a session. Hub-owned -> kill its tmux session; a live external process ->
// SIGTERM then escalate to SIGKILL (Claude's interactive TUI traps SIGTERM, so a
// polite signal alone often doesn't stop it); an already-dead entry -> just remove
// the stale registry file so it stops showing.
async function killSession({ tmuxName, pid, dead } = {}) {
  try {
    if (tmuxName) await tmux.kill(tmuxName)
    if (pid != null) {
      const n = Number(pid)
      const entry = registry.entries.get(n)
      if (dead || !entry) {
        await fsp.rm(path.join(config.sessionsDir, `${n}.json`), { force: true })
      } else {
        try { process.kill(n, 'SIGTERM') } catch { /* already gone */ }
        // Give it a moment to exit cleanly; if it's still there, force it, then
        // clear its registry file (a hard-killed process won't clean up its own).
        for (const delay of [700, 1600, 3000]) {
          setTimeout(() => {
            if (!pidAlive(n)) return
            try { process.kill(n, 'SIGKILL') } catch { /* gone */ }
            fsp.rm(path.join(config.sessionsDir, `${n}.json`), { force: true }).catch(() => {})
            requestRefresh()
          }, delay)
        }
      }
    }
    setTimeout(requestRefresh, 300)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

function serveStatic(pathname, res) {
  let rel = pathname === '/' ? '/index.html' : pathname
  let file = path.join(distDir, rel)
  if (!file.startsWith(distDir)) return notFound(res)
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback.
      return fs.readFile(path.join(distDir, 'index.html'), (e2, html) => {
        if (e2) return notFound(res, 'Run `npm run build` first (or use `npm run dev`).')
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(html)
      })
    }
    res.writeHead(200, { 'content-type': mime(file) })
    res.end(data)
  })
}

// ---- WebSocket: /ws/control (JSON) and /ws/pty (terminal) --------------------
const controlWss = new WebSocketServer({ noServer: true })
const ptyWss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/ws/control') {
    controlWss.handleUpgrade(req, socket, head, (ws) => {
      controlWss.emit('connection', ws)
      ws.send(JSON.stringify({ type: 'snapshot', ...latest }))
    })
  } else if (url.pathname === '/ws/pty') {
    ptyWss.handleUpgrade(req, socket, head, (ws) => attachPty(ws, url))
  } else {
    socket.destroy()
  }
})

function broadcastControl(msg) {
  const data = JSON.stringify(msg)
  for (const ws of controlWss.clients) if (ws.readyState === 1) ws.send(data)
}

async function attachPty(ws, url) {
  const name = url.searchParams.get('name')
  if (!name || !tmux.available) {
    ws.send(JSON.stringify({ type: 'error', message: 'session not found' }))
    return ws.close()
  }
  // Buffer live output until the seed is painted (see seedNow). Forwarding it
  // before the seed — while the program is mid-render — draws a partial frame
  // that the seed then sits on top of, and the program's next relative redraw
  // lands against a cursor the live stream has already moved past, leaving stale
  // "leftover" text below the cursor. Gating means the seed is a clean baseline
  // and the live stream continues from exactly the seeded cursor.
  let live = false
  let stop = () => {}

  // Seed the terminal once we know the client's size. We write scrollback history
  // first (so the user can scroll up), then the visible screen padded to exactly
  // the pane height, then place the cursor where the program actually has it.
  // Padding to full height makes the last rows of the stream align 1:1 with the
  // visible screen, so the absolute cursor move lands correctly — otherwise
  // xterm's cursor sits at the end of the dump and the program's next relative
  // redraw (Ink moves the cursor up N lines and repaints) garbles the screen.
  // capture-pane joins lines with bare "\n"; convert to CRLF or xterm renders a
  // diagonal staircase (convertEol:false).
  let seeded = false
  let clientRows = 0 // the client's xterm row count, learned from its resize message
  const seedNow = async () => {
    if (seeded || ws.readyState !== 1) return
    seeded = true
    const [screen, history] = await Promise.all([tmux.capture(name), tmux.scrollback(name)])
    const cur = await tmux.cursor(name) // query the cursor last, closest to going live
    if (ws.readyState !== 1) return
    // Pad the visible screen to the CLIENT's row count (what xterm actually is),
    // not the pane height. If a competing viewer is holding the pane at a smaller
    // size, padding to the pane height would leave the screen block sitting at the
    // bottom of the taller viewport with scrollback above it, so the absolute
    // cursor move lands mid-screen and typed echoes mesh into old text. Padding to
    // the client's rows keeps the screen block filling the viewport from the top.
    const h = clientRows || cur.height || 24
    let rows = screen.replace(/\n$/, '').split('\n')
    if (rows.length > h) rows = rows.slice(-h)
    while (rows.length < h) rows.push('') // pad to full height for cursor alignment
    const historyPart = history ? history.replace(/\n/g, '\r\n') + '\r\n' : ''
    const cy = Math.min(cur.y, h - 1) // cursor row within the viewport
    const place = `\x1b[${cy + 1};${cur.x + 1}H` // 1-based absolute cursor
    ws.send('\x1b[2J\x1b[H' + historyPart + rows.join('\r\n') + place)
    live = true // from here, forward live output — it continues from the seeded cursor
  }

  // Register the message handler synchronously — BEFORE the async has-check
  // below. The client sends its resize the instant the socket opens; if the
  // handler weren't attached yet, `ws` would drop that frame (no listener), we'd
  // never learn the client's rows, and the seed would fall back to the pane
  // height — misplacing the cursor whenever a competing viewer holds the pane at
  // a different size.
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.t === 'i') await tmux.sendKeys(name, msg.d)
      else if (msg.t === 'r') {
        // Remember the client's real row count so both seed paths pad to it;
        // resize fire-and-forget so a slow (contended) tmux call can't delay
        // learning the size or scheduling the seed.
        clientRows = msg.r || clientRows
        if (!seeded) setTimeout(seedNow, 130) // let claude repaint at the new size
        tmux.resize(name, msg.c, msg.r)
      }
    } catch {
      /* ignore malformed */
    }
  })
  ws.on('close', () => stop())
  ws.on('error', () => stop())

  if (!(await tmux.has(name))) {
    ws.send(JSON.stringify({ type: 'error', message: 'session not found' }))
    return ws.close()
  }
  stop = tmux.openStream(name, (buf) => {
    if (live && ws.readyState === 1) ws.send(buf)
  })
  // Fallback in case the client never reports a size. Kept long so a contended
  // event loop still processes the client's resize (and sets clientRows) first.
  setTimeout(seedNow, 900)
}

// ---- helpers ----------------------------------------------------------------
function json(res, obj, code = 200) {
  const data = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(data)
}
function notFound(res, msg = 'not found') {
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end(msg)
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => (d += c))
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')) } catch { resolve(null) }
    })
  })
}
function mime(f) {
  const e = path.extname(f)
  return {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  }[e] || 'application/octet-stream'
}

// ---- boot -------------------------------------------------------------------
async function main() {
  await tmux.init()
  await loadTasks()
  await loadSettings()
  const voice = await detectVoiceBackend() // local whisper for Telegram voice notes
  telegramLoop() // long-poll for Telegram commands (idles until enabled)
  await registry.start()
  // When launched by the Electron shell (MC_EPHEMERAL), bind an OS-assigned port
  // and report it back to the parent — avoids fixed-port conflicts. Standalone
  // `npm start` uses config.port (4600).
  const port = process.env.MC_EPHEMERAL ? 0 : config.port
  // Bind to loopback by default: the hub can launch/drive terminals and read every
  // transcript with no auth, so it must NOT be reachable from the LAN unless the
  // user explicitly opts in with MC_HOST=0.0.0.0 (e.g. to reach it from a phone on
  // the same network — do that only on a trusted network).
  const host = process.env.MC_HOST || '127.0.0.1'
  const exposed = host !== '127.0.0.1' && host !== 'localhost'
  server.listen(port, host, () => {
    const actual = server.address().port
    console.log(`\n  ▸ oversee.sh server on http://localhost:${actual}`)
    if (exposed) console.log(`    ⚠ bound to ${host} — reachable on your network, and it has no auth`)
    console.log(`    tmux: ${tmux.available ? 'available (can launch sessions)' : 'NOT found — monitor-only mode'}`)
    console.log(`    voice: ${voice.available ? voice.detail : 'no whisper — Telegram voice notes disabled'}`)
    console.log(`    UI:   ${fs.existsSync(distDir) ? 'built (open the URL above)' : 'run `npm run dev` for the dev UI on :5180'}\n`)
    process.parentPort?.postMessage({ type: 'ready', port: actual })
  })
}
main().catch((e) => {
  console.error('fatal', e)
  process.exit(1)
})
