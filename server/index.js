import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

import { config } from './config.js'
import { RegistryWatcher } from './registry/watcher.js'
import { TranscriptStore } from './transcript/tailer.js'
import { StateEngine, State } from './state/engine.js'
import { Notifier } from './notify/notifier.js'
import { TmuxManager } from './pty/tmuxManager.js'
import { gitDiffStat } from './git/diffStat.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

const registry = new RegistryWatcher()
const transcripts = new TranscriptStore()
const engine = new StateEngine()
const notifier = new Notifier()
const tmux = new TmuxManager()

let latest = { sessions: [], tmuxAvailable: false, hubSessions: [] }
const titleBySession = new Map()

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
}

registry.on('change', (entries) => refresh(entries).catch((e) => console.error('refresh', e)))

// Also refresh on a steady tick so token counts / activity update while a
// session is mid-turn (its registry file heartbeats, but we want fresh content).
setInterval(() => refresh(registry.entries).catch(() => {}), 1500)

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
      refresh(registry.entries).catch(() => {})
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
      const task = { id: ++taskSeq, text, status: 'todo', agent: null, createdAt: Date.now() }
      tasks.push(task)
      await saveTasks(); broadcastTasks()
      return json(res, task)
    }
    if (url.pathname === '/api/tasks/update' && req.method === 'POST') {
      const body = await readBody(req)
      const t = tasks.find((x) => x.id === body?.id)
      if (t) {
        if (typeof body.status === 'string') t.status = body.status
        if ('agent' in body) t.agent = body.agent
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
            refresh(registry.entries).catch(() => {})
          }, delay)
        }
      }
    }
    setTimeout(() => refresh(registry.entries).catch(() => {}), 300)
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
  if (!name || !tmux.available || !(await tmux.has(name))) {
    ws.send(JSON.stringify({ type: 'error', message: 'session not found' }))
    return ws.close()
  }
  // Stream live output immediately.
  const stop = tmux.openStream(name, (buf) => {
    if (ws.readyState === 1) ws.send(buf)
  })

  // Seed the current screen once we know the client's size, so the dump matches
  // its width. capture-pane joins lines with bare "\n"; convert to CRLF or xterm
  // (convertEol:false) renders it as a diagonal staircase. Clear first for a
  // clean paint.
  let seeded = false
  const seedNow = async () => {
    if (seeded || ws.readyState !== 1) return
    seeded = true
    const seed = await tmux.capture(name)
    if (seed && ws.readyState === 1) ws.send('\x1b[2J\x1b[H' + seed.replace(/\n/g, '\r\n'))
  }

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.t === 'i') await tmux.sendKeys(name, msg.d)
      else if (msg.t === 'r') {
        await tmux.resize(name, msg.c, msg.r)
        if (!seeded) setTimeout(seedNow, 130) // let claude repaint at the new size
      }
    } catch {
      /* ignore malformed */
    }
  })
  // Fallback in case the client never reports a size.
  setTimeout(seedNow, 500)
  ws.on('close', stop)
  ws.on('error', stop)
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
  await registry.start()
  server.listen(config.port, () => {
    console.log(`\n  ▸ oversee.sh server on http://localhost:${config.port}`)
    console.log(`    tmux: ${tmux.available ? 'available (can launch sessions)' : 'NOT found — monitor-only mode'}`)
    console.log(`    UI:   ${fs.existsSync(distDir) ? 'built (open the URL above)' : 'run `npm run dev` for the dev UI on :5173'}\n`)
  })
}
main().catch((e) => {
  console.error('fatal', e)
  process.exit(1)
})
