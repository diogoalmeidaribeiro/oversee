import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { resolveTranscript } from './paths.js'
import { emptySummary, applyRecord, finalize } from './extract.js'

// Maintains one incremental reader per session. On first sight it backfills only
// the tail of the (possibly multi-MB) file, then reads just the new bytes each
// time it is poked. Transcripts are append-only, so a byte offset is all we need.

const BACKFILL_BYTES = 96 * 1024

class Reader {
  constructor(file) {
    this.file = file
    this.offset = 0
    this.partial = ''
    this.sum = emptySummary()
    this.seeded = false
    // Stats for work done AFTER the initial backfill = "since the hub started".
    this.live = { turns: 0, tokensOut: 0, files: new Set(), newTurns: [] }
  }

  async _seed() {
    const stat = await fsp.stat(this.file)
    const start = Math.max(0, stat.size - BACKFILL_BYTES)
    const fd = await fsp.open(this.file, 'r')
    try {
      const len = stat.size - start
      const buf = Buffer.alloc(len)
      await fd.read(buf, 0, len, start)
      let text = buf.toString('utf8')
      // If we started mid-file, drop the first (likely partial) line.
      if (start > 0) text = text.slice(text.indexOf('\n') + 1)
      this._consume(text)
      this.offset = stat.size
    } finally {
      await fd.close()
    }
    this.seeded = true
  }

  async poll() {
    if (!this.seeded) {
      await this._seed()
      return true
    }
    const stat = await fsp.stat(this.file)
    if (stat.size <= this.offset) {
      if (stat.size < this.offset) {
        // File shrank/rotated — start over.
        this.offset = 0
        this.partial = ''
        this.sum = emptySummary()
        this.seeded = false
      }
      return false
    }
    const fd = await fsp.open(this.file, 'r')
    try {
      const len = stat.size - this.offset
      const buf = Buffer.alloc(len)
      await fd.read(buf, 0, len, this.offset)
      this._consume(buf.toString('utf8'))
      this.offset = stat.size
    } finally {
      await fd.close()
    }
    return true
  }

  _consume(text) {
    // Records read after the seed are "live" (done since the hub started).
    const live = this.seeded ? this.live : null
    const data = this.partial + text
    const lines = data.split('\n')
    this.partial = lines.pop() ?? '' // last chunk may be an incomplete line
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        applyRecord(this.sum, JSON.parse(line), live)
      } catch {
        /* skip malformed line */
      }
    }
  }

  view() {
    return {
      ...finalize(this.sum),
      doneSinceStart: this.live.turns,
      tokensSinceStart: this.live.tokensOut,
      filesSinceStart: this.live.files.size,
    }
  }

  // Turns completed since the last drain — used to build the "recently done" feed.
  drainNewTurns() {
    if (!this.live.newTurns.length) return []
    const out = this.live.newTurns
    this.live.newTurns = []
    return out
  }
}

export class TranscriptStore {
  constructor() {
    this.readers = new Map() // sessionId -> Reader
    this.paths = new Map()   // sessionId -> resolved file path (or null)
  }

  async ensure(cwd, sessionId) {
    if (this.readers.has(sessionId)) return
    if (this.paths.has(sessionId) && this.paths.get(sessionId) == null) return
    const file = await resolveTranscript(cwd, sessionId)
    this.paths.set(sessionId, file)
    if (file && fs.existsSync(file)) this.readers.set(sessionId, new Reader(file))
  }

  async update(cwd, sessionId) {
    await this.ensure(cwd, sessionId)
    const r = this.readers.get(sessionId)
    if (!r) return false
    try {
      return await r.poll()
    } catch {
      return false
    }
  }

  view(sessionId) {
    return this.readers.get(sessionId)?.view() ?? null
  }

  drainNewTurns(sessionId) {
    return this.readers.get(sessionId)?.drainNewTurns() ?? []
  }

  forget(sessionId) {
    this.readers.delete(sessionId)
    this.paths.delete(sessionId)
  }
}
