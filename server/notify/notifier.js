import path from 'node:path'
import { config } from '../config.js'
import { State } from '../state/engine.js'

// Native macOS notifications for the two transitions that matter, with anti-spam:
// per-session cooldown, burst coalescing, and a startup grace so restarting the
// hub never blasts you with "N sessions waiting".

let notifier = null
try {
  notifier = (await import('node-notifier')).default
} catch {
  notifier = null // degrade silently to no native notifications
}

export class Notifier {
  constructor() {
    this.bootedAt = Date.now()
    this.lastSent = new Map() // key -> ts
    this.pending = []         // coalescing buffer
    this._flushTimer = null
  }

  _inGrace(now) {
    return now - this.bootedAt < config.startupGraceMs
  }

  handleTransitions(transitions, titleOf) {
    const now = Date.now()
    if (this._inGrace(now)) return
    for (const t of transitions) {
      let kind = null
      if (t.to === State.WAITING) kind = 'waiting'
      else if (t.to === State.IDLE && (t.from === State.WORKING || t.from === State.WAITING)) kind = 'finished'
      else if (t.to === State.DEAD && (t.from === State.WORKING || t.from === State.WAITING)) kind = 'died'
      if (!kind) continue

      const key = `${t.sessionId}:${kind}`
      const last = this.lastSent.get(key) ?? 0
      if (now - last < config.notifyCooldownMs) continue
      this.lastSent.set(key, now)

      const name = titleOf(t.sessionId) || shortCwd(t.entry?.cwd) || 'session'
      this.pending.push({ kind, name })
    }
    if (this.pending.length && !this._flushTimer) {
      this._flushTimer = setTimeout(() => this._flush(), config.notifyCoalesceMs)
    }
  }

  _flush() {
    this._flushTimer = null
    const batch = this.pending
    this.pending = []
    if (!batch.length || !notifier) return

    if (batch.length >= 3) {
      const waiting = batch.filter((b) => b.kind === 'waiting').length
      const finished = batch.filter((b) => b.kind === 'finished').length
      const parts = []
      if (waiting) parts.push(`${waiting} waiting`)
      if (finished) parts.push(`${finished} finished`)
      this._send('oversee.sh', parts.join(' · ') || `${batch.length} updates`)
      return
    }
    for (const b of batch) {
      if (b.kind === 'waiting') this._send('Needs your input', b.name)
      else if (b.kind === 'finished') this._send('Finished', `${b.name} is done`)
      else if (b.kind === 'died') this._send('Session ended', `${b.name} stopped unexpectedly`)
    }
  }

  _send(title, message) {
    try {
      notifier.notify({ title, message, sound: false, timeout: 6 })
    } catch {
      /* ignore */
    }
  }
}

function shortCwd(cwd) {
  return cwd ? path.basename(cwd) : null
}
