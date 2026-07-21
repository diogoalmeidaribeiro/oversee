import { config } from '../config.js'
import { isProcessAlive } from '../registry/fingerprint.js'

// Derived states. WAITING = needs you; that plus JUST_FINISHED are what float to
// the top of the dashboard and drive notifications.
export const State = {
  WAITING: 'waiting',
  WORKING: 'working',
  SHELL: 'shell',
  IDLE: 'idle',
  DEAD: 'dead',
}

// Sort priority: lower = higher on screen.
const PRIORITY = {
  [State.WAITING]: 0,
  [State.WORKING]: 2,
  [State.SHELL]: 3,
  [State.IDLE]: 4,
  [State.DEAD]: 5,
}

function rawToState(status) {
  switch (status) {
    case 'waiting': return State.WAITING
    case 'busy': return State.WORKING
    case 'shell': return State.SHELL
    case 'idle': return State.IDLE
    default: return State.IDLE
  }
}

export class StateEngine {
  constructor() {
    this.prev = new Map()      // sessionId -> derived state (for edge detection)
    this.finishedAt = new Map()// sessionId -> ts when it went idle (for justFinished)
    this._liveCache = new Map()// pid -> { alive, checkedAt }
  }

  // Liveness is decided by the process itself, NOT by heartbeat freshness: the
  // registry's updatedAt only ticks while a session is *active*, so a genuinely
  // running-but-idle claude can be quiet for hours. The authoritative signal is
  // a pid + procStart fingerprint match via `ps` (which also defeats recycled
  // PIDs on stale files). Freshness is used only to skip the ps call when a
  // session obviously just did something.
  async _live(entry, now) {
    const age = now - (entry.updatedAt ?? 0)
    if (age <= 10_000) return true
    const cached = this._liveCache.get(entry.pid)
    if (cached && now - cached.checkedAt < 8_000) return cached.alive
    const alive = await isProcessAlive(entry.pid, entry.procStart)
    this._liveCache.set(entry.pid, { alive, checkedAt: now })
    return alive
  }

  /**
   * @param {Map<number, object>} entries raw registry keyed by pid
   * @param {number} now epoch ms
   * @returns {Promise<{sessions: object[], transitions: object[]}>}
   */
  async derive(entries, now) {
    const sessions = []
    const seen = new Set()
    const transitions = []

    for (const entry of entries.values()) {
      const sid = entry.sessionId
      if (!sid) continue
      seen.add(sid)
      const live = await this._live(entry, now)
      let state = live ? rawToState(entry.status) : State.DEAD

      // Track just-finished edge (working/waiting -> idle).
      const prev = this.prev.get(sid)
      if ((prev === State.WORKING || prev === State.WAITING) && state === State.IDLE) {
        this.finishedAt.set(sid, now)
      }
      if (state !== State.IDLE) this.finishedAt.delete(sid)

      const finishedAt = this.finishedAt.get(sid)
      const justFinished = finishedAt != null && now - finishedAt < config.justFinishedMs

      if (prev !== state) transitions.push({ sessionId: sid, from: prev, to: state, entry })
      this.prev.set(sid, state)

      sessions.push({
        sessionId: sid,
        pid: entry.pid,
        cwd: entry.cwd,
        rawStatus: entry.status,
        state,
        justFinished,
        live,
        startedAt: entry.startedAt,
        updatedAt: entry.updatedAt,
        ageMs: now - (entry.updatedAt ?? now),
        version: entry.version,
        kind: entry.kind,
      })
    }

    // Sessions that vanished from the registry are dead. Emit the DEAD transition
    // once, then forget them entirely — keeping them forever leaked one Map entry
    // per session ever seen. (If the same sessionId reappears it's a fresh life and
    // is correctly treated as new.)
    for (const sid of [...this.prev.keys()]) {
      if (!seen.has(sid)) {
        const prev = this.prev.get(sid)
        if (prev !== State.DEAD) transitions.push({ sessionId: sid, from: prev, to: State.DEAD })
        this.prev.delete(sid)
        this.finishedAt.delete(sid)
      }
    }

    // Prune the pid->liveness cache to pids still in the registry.
    const livePids = new Set([...entries.values()].map((e) => e.pid))
    for (const pid of this._liveCache.keys()) if (!livePids.has(pid)) this._liveCache.delete(pid)

    sessions.sort((a, b) => {
      const pa = a.justFinished ? 1 : PRIORITY[a.state]
      const pb = b.justFinished ? 1 : PRIORITY[b.state]
      if (pa !== pb) return pa - pb
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    })

    return { sessions, transitions }
  }
}
