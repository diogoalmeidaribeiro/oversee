import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from '../config.js'

const pexec = promisify(execFile)

// Named keys the Telegram bot may send to a pane (tmux key-name syntax). Kept to
// a safe, useful set: menu navigation + a few control keys.
export const SPECIAL_KEYS = new Set([
  'Enter', 'Escape', 'Up', 'Down', 'Left', 'Right', 'Tab', 'BSpace', 'Space',
  'C-c', 'C-d', 'C-u', 'C-r', 'C-a', 'C-e', 'PageUp', 'PageDown',
])

// Owns Claude sessions the hub launches, using tmux as the durable backbone.
// No native modules: output is streamed via `tmux pipe-pane` to a temp file we
// tail; input is forwarded via `tmux send-keys -H`. Sessions survive browser
// refresh AND hub restarts because tmux keeps them running detached.

function tmux(args, opts = {}) {
  return pexec(config.tmuxBin, args, { timeout: 5000, maxBuffer: 1 << 22, ...opts })
}

export class TmuxManager {
  constructor() {
    this.available = false
    this.pipeDir = path.join(os.tmpdir(), 'mc-panes')
  }

  async init() {
    try {
      await tmux(['-V'])
      this.available = true
      await fsp.mkdir(this.pipeDir, { recursive: true })
    } catch {
      this.available = false
    }
    return this.available
  }

  _name(id) {
    return `${config.tmuxPrefix}${id}`
  }

  // Launch a fresh claude session in `cwd`. Returns the tmux session name.
  async launch(cwd, cols = 120, rows = 32) {
    if (!this.available) throw new Error('tmux not available')
    const id = Math.abs(hash(cwd + ':' + Date.now())).toString(36).slice(0, 8)
    const name = this._name(id)
    await tmux([
      'new-session', '-d', '-s', name,
      '-x', String(cols), '-y', String(rows),
      '-c', cwd,
      `exec ${config.claudeBin}`,
    ])
    // Keep window size stable regardless of attached clients.
    await tmux(['set-option', '-t', name, 'window-size', 'manual']).catch(() => {})
    return { name, cwd, id }
  }

  async list() {
    if (!this.available) return []
    try {
      const { stdout } = await tmux([
        'list-sessions', '-F',
        '#{session_name}\t#{pane_current_path}\t#{window_width}\t#{window_height}',
      ])
      return stdout
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('\t'))
        .filter(([n]) => n.startsWith(config.tmuxPrefix))
        .map(([name, cwd, w, h]) => ({ name, cwd, cols: Number(w), rows: Number(h) }))
    } catch {
      return []
    }
  }

  async has(name) {
    try {
      await tmux(['has-session', '-t', name])
      return true
    } catch {
      return false
    }
  }

  // The visible screen (with colors) to seed a freshly-connected terminal. We
  // capture ONLY the visible pane — not scrollback — so it maps 1:1 onto the
  // client's rows and the cursor can be placed exactly where the program thinks
  // it is (see seed()); dumping scrollback would leave xterm's cursor far from
  // the program's, and its next relative redraw would land in the wrong place.
  async capture(name) {
    try {
      const { stdout } = await tmux(['capture-pane', '-p', '-e', '-t', name])
      return stdout
    } catch {
      return ''
    }
  }

  // Where the program's cursor currently is (0-based col/row within the pane),
  // plus the pane height so the seed can pad the visible screen to full height.
  async cursor(name) {
    try {
      const { stdout } = await tmux(['display-message', '-p', '-t', name, '#{cursor_x},#{cursor_y},#{pane_height}'])
      const [x, y, height] = stdout.trim().split(',').map((n) => Number(n) || 0)
      return { x, y, height }
    } catch {
      return { x: 0, y: 0, height: 0 }
    }
  }

  // Lines above the visible screen (history) so the client can scroll up. Kept
  // separate from the visible screen (capture) so the latter can be padded to
  // exactly pane height and stay cursor-aligned — see the seed in index.js.
  async scrollback(name) {
    try {
      const { stdout } = await tmux(['capture-pane', '-p', '-e', '-S', '-3000', '-E', '-1', '-t', name])
      return stdout
    } catch {
      return ''
    }
  }

  async resize(name, cols, rows) {
    if (!cols || !rows) return
    await tmux(['resize-window', '-t', name, '-x', String(cols), '-y', String(rows)]).catch(() => {})
  }

  // Plain (no ANSI) snapshot of the visible pane — used to reply with a session's
  // current screen over Telegram, where escape codes would be noise.
  async capturePlain(name) {
    try {
      const { stdout } = await tmux(['capture-pane', '-p', '-t', name])
      return stdout
    } catch {
      return ''
    }
  }

  // Send a single named key (Enter, Escape, Up, Down, Tab, C-c, …) to drive
  // Claude's TUI menus from Telegram. Only allowlisted tokens reach send-keys, so
  // a caller can't inject extra tmux arguments.
  async sendSpecial(name, key) {
    if (!SPECIAL_KEYS.has(key)) return false
    await tmux(['send-keys', '-t', name, key]).catch(() => {})
    return true
  }

  // Forward raw bytes from the browser terminal into the pane.
  async sendKeys(name, data) {
    const hex = Buffer.from(data, 'utf8')
    const parts = []
    for (const b of hex) parts.push(b.toString(16).padStart(2, '0'))
    if (!parts.length) return
    await tmux(['send-keys', '-t', name, '-H', ...parts]).catch(() => {})
  }

  // Submit a prompt to the pane's program: type the literal text, then send Enter
  // as a SEPARATE keypress after a pause. Claude's TUI treats a burst of text that
  // ends in a newline as a paste (newline inserted, not submitted), so the Enter
  // must arrive as its own discrete event to actually submit.
  async sendPrompt(name, text) {
    await tmux(['send-keys', '-t', name, '-l', text]).catch(() => {})
    await new Promise((r) => setTimeout(r, 120))
    await tmux(['send-keys', '-t', name, 'Enter']).catch(() => {})
  }

  async kill(name) {
    await tmux(['kill-session', '-t', name]).catch(() => {})
  }

  // Start streaming pane output to a temp file and invoke onData with new bytes.
  // Returns a stop() handle. Ref-counting keeps a single pipe per pane.
  openStream(name, onData) {
    const file = path.join(this.pipeDir, `${name}.log`)
    if (!this._streams) this._streams = new Map()
    let s = this._streams.get(name)
    if (!s) {
      // Truncate + (re)start the pipe. No `-o`: that flag makes pipe-pane a
      // toggle (open if none, else close), which races our explicit open/close
      // — a quick reconnect or a hub restart with a lingering pipe would toggle
      // streaming OFF and freeze the pane. Plain pipe-pane always (re)opens.
      try { fs.writeFileSync(file, '') } catch {}
      tmux(['pipe-pane', '-t', name, `cat >> ${shellQuote(file)}`]).catch(() => {})
      s = { file, offset: 0, refs: 0, listeners: new Set(), watcher: null }
      // `cat >>` appends forever, so the pipe file would grow without bound while a
      // terminal stays open (a chatty session — a build, a runaway loop — fills the
      // disk). Once we've streamed past this many bytes, truncate and rewind: we're
      // caught up to EOF at that point, so at most a 60ms sliver of output is lost.
      const ROTATE_BYTES = 8 * 1024 * 1024
      const pump = () => {
        try {
          const stat = fs.statSync(file)
          if (stat.size > s.offset) {
            const fd = fs.openSync(file, 'r')
            const len = stat.size - s.offset
            const buf = Buffer.alloc(len)
            fs.readSync(fd, buf, 0, len, s.offset)
            fs.closeSync(fd)
            s.offset = stat.size
            for (const l of s.listeners) l(buf)
          }
          if (s.offset >= ROTATE_BYTES) {
            try { fs.truncateSync(file); s.offset = 0 } catch {}
          }
        } catch {}
      }
      s.watcher = setInterval(pump, 60)
      this._streams.set(name, s)
    }
    s.refs++
    s.listeners.add(onData)
    return () => {
      s.listeners.delete(onData)
      s.refs--
      if (s.refs <= 0) {
        clearInterval(s.watcher)
        tmux(['pipe-pane', '-t', name]).catch(() => {}) // toggle off
        this._streams.delete(name)
        fs.rm(file, { force: true }, () => {}) // don't leave the pipe log on disk
      }
    }
  }
}

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return h
}

function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
