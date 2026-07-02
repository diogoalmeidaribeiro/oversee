import fs from 'node:fs/promises'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import chokidar from 'chokidar'
import { config } from '../config.js'

// Watches ~/.claude/sessions/ — the small, ~1/sec-updated registry that is the
// source of truth for which claude processes exist and their status.
//
// Emits 'change' (debounced) with a Map<pid, entry> of the current raw registry.

export class RegistryWatcher extends EventEmitter {
  constructor() {
    super()
    this.entries = new Map() // pid -> parsed json
    this._timer = null
  }

  async start() {
    await this._scanAll()
    this.watcher = chokidar.watch(config.sessionsDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
    })
    this.watcher
      .on('add', (f) => this._onFile(f))
      .on('change', (f) => this._onFile(f))
      .on('unlink', (f) => this._onUnlink(f))
    // Safety net tick in case an fs event is missed.
    this._tick = setInterval(() => this._scanAll().then(() => this._emit()), 5000)
    this._emit()
  }

  async _scanAll() {
    let files = []
    try {
      files = await fs.readdir(config.sessionsDir)
    } catch {
      return
    }
    const next = new Map()
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const entry = await this._read(path.join(config.sessionsDir, f))
          if (entry?.pid != null) next.set(entry.pid, entry)
        }),
    )
    this.entries = next
  }

  async _read(file) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null // mid-write / partial json — keep calm, next event will retry
    }
  }

  async _onFile(file) {
    if (!file.endsWith('.json')) return
    const entry = await this._read(file)
    if (entry?.pid != null) {
      this.entries.set(entry.pid, entry)
      this._emit()
    }
  }

  _onUnlink(file) {
    const pid = Number(path.basename(file, '.json'))
    if (this.entries.delete(pid)) this._emit()
  }

  _emit() {
    clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this.emit('change', new Map(this.entries))
    }, config.snapshotDebounceMs)
  }

  stop() {
    clearInterval(this._tick)
    clearTimeout(this._timer)
    this.watcher?.close()
  }
}
