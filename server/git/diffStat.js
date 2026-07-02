import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const pexec = promisify(execFile)

// Cheap "what changed in this repo" summary. Lazy / on-demand only — never in
// the hot path. Guards for non-git dirs.
export async function gitDiffStat(cwd) {
  try {
    const opts = { cwd, timeout: 4000, maxBuffer: 1 << 20 }
    const [numstat, status] = await Promise.all([
      pexec('git', ['diff', '--numstat'], opts),
      pexec('git', ['status', '--porcelain'], opts),
    ])
    let insertions = 0
    let deletions = 0
    const files = new Set()
    for (const line of numstat.stdout.split('\n')) {
      const m = line.trim().match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (!m) continue
      if (m[1] !== '-') insertions += Number(m[1])
      if (m[2] !== '-') deletions += Number(m[2])
      files.add(m[3])
    }
    const untracked = status.stdout
      .split('\n')
      .filter((l) => l.startsWith('??')).length
    for (const l of status.stdout.split('\n')) {
      const f = l.slice(3).trim()
      if (f) files.add(f)
    }
    return { isRepo: true, insertions, deletions, filesChanged: files.size, untracked }
  } catch {
    return { isRepo: false }
  }
}
