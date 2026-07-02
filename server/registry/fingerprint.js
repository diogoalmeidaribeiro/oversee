import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const pexec = promisify(execFile)

// PIDs get recycled on macOS, so a bare `ps -p <pid>` can report a long-dead
// session as "alive". We confirm identity by matching the registry's procStart
// string against the process's real start time from `ps -o lstart`.
//
// The two strings are rendered differently (Claude vs ps) and can differ by a
// timezone/DST hour, so we parse both to epoch seconds and allow a generous skew.

const MAX_SKEW_SEC = 3600 + 120 // one hour (TZ) + a little slack

function parseLstart(s) {
  // e.g. "Wed Jul  1 18:27:28 2026" -> Date. Native Date parsing handles this.
  const t = Date.parse(s.replace(/\s+/g, ' ').trim())
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}

/**
 * @returns {Promise<boolean>} true if a live process matches this registry entry.
 */
export async function isProcessAlive(pid, procStart) {
  try {
    const { stdout } = await pexec('ps', ['-o', 'lstart=', '-p', String(pid)])
    const actual = parseLstart(stdout)
    if (actual == null) return false
    if (!procStart) return true // no fingerprint to compare; process exists
    const claimed = parseLstart(procStart)
    if (claimed == null) return true
    return Math.abs(actual - claimed) <= MAX_SKEW_SEC
  } catch {
    // ps exits non-zero when the pid does not exist.
    return false
  }
}
