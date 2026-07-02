import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

// A session's transcript lives at:
//   ~/.claude/projects/<cwd-slug>/<sessionId>.jsonl
// where cwd-slug is the cwd with every '/' (and '.') turned into '-'.
// The slug can be ambiguous, so we compute the fast path but fall back to a
// glob-by-sessionId across the projects dir on a miss (sessionId is unique).

export function slugForCwd(cwd) {
  return cwd.replace(/[/.]/g, '-')
}

export async function resolveTranscript(cwd, sessionId) {
  const fast = path.join(config.projectsDir, slugForCwd(cwd), `${sessionId}.jsonl`)
  try {
    await fs.access(fast)
    return fast
  } catch {
    // Fall back: scan project dirs for <sessionId>.jsonl.
    try {
      const dirs = await fs.readdir(config.projectsDir)
      for (const d of dirs) {
        const p = path.join(config.projectsDir, d, `${sessionId}.jsonl`)
        try {
          await fs.access(p)
          return p
        } catch {
          /* keep looking */
        }
      }
    } catch {
      /* projects dir unreadable */
    }
    return null
  }
}
