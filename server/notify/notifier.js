import path from 'node:path'
import { config } from '../config.js'
import { State } from '../state/engine.js'
import { sendTelegram } from './telegram.js'

// Notifications for the two transitions that matter, delivered to every enabled
// channel (native macOS + Telegram), with shared anti-spam: per-session cooldown,
// burst coalescing, and a startup grace so restarting the hub never blasts you.

let notifier = null
try {
  notifier = (await import('node-notifier')).default
} catch {
  notifier = null // degrade silently to no native notifications
}

export class Notifier {
  // getTelegram() returns the current { enabled, token, chatId } or null.
  constructor(getTelegram) {
    this.getTelegram = getTelegram || (() => null)
    this.bootedAt = Date.now()
    this.lastSent = new Map() // key -> ts
    this.pending = []         // coalescing buffer
    this._flushTimer = null
  }

  _inGrace(now) {
    return now - this.bootedAt < config.startupGraceMs
  }

  // Forget cooldown keys for sessions that have left the registry (keys are
  // `${sessionId}:${kind}`), so lastSent doesn't accumulate one entry per session
  // ever seen. `keep` is a Set of live sessionIds.
  retain(keep) {
    for (const key of this.lastSent.keys()) {
      const sid = key.slice(0, key.lastIndexOf(':'))
      if (!keep.has(sid)) this.lastSent.delete(key)
    }
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
    if (!batch.length) return

    // Build the human notifications, then dispatch each to every channel.
    const notes = []
    if (batch.length >= 3) {
      const waiting = batch.filter((b) => b.kind === 'waiting').length
      const finished = batch.filter((b) => b.kind === 'finished').length
      const parts = []
      if (waiting) parts.push(`${waiting} waiting`)
      if (finished) parts.push(`${finished} finished`)
      notes.push({ emoji: '🔔', title: 'oversee', message: parts.join(' · ') || `${batch.length} updates` })
    } else {
      for (const b of batch) {
        if (b.kind === 'waiting') notes.push({ emoji: '🔴', title: 'Needs your input', message: b.name })
        else if (b.kind === 'finished') notes.push({ emoji: '✅', title: 'Finished', message: `${b.name} is done` })
        else if (b.kind === 'died') notes.push({ emoji: '⚫', title: 'Session ended', message: `${b.name} stopped unexpectedly` })
      }
    }

    const tg = this.getTelegram?.()
    for (const n of notes) {
      this._sendNative(n.title, n.message)
      this._sendTelegram(tg, n)
    }
  }

  _sendNative(title, message) {
    if (!notifier) return
    try {
      notifier.notify({ title, message, sound: false, timeout: 6 })
    } catch {
      /* ignore */
    }
  }

  _sendTelegram(tg, n) {
    if (!tg || !tg.enabled || !tg.token || !tg.chatId) return
    const text = `${n.emoji} <b>${esc(n.title)}</b>\n${esc(n.message)}`
    sendTelegram(tg.token, tg.chatId, text).catch(() => {})
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shortCwd(cwd) {
  return cwd ? path.basename(cwd) : null
}
