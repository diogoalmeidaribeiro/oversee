import { useMemo } from 'react'
import { Icon } from './icons.jsx'
import { ago } from '../lib/format.js'

// Left "news rail": per-project progress bars + a reverse-chronological feed of
// turns completed since the hub started.
export function NewsRail({ sessions, doneFeed, now }) {
  const projects = useMemo(() => {
    const map = new Map()
    for (const s of sessions) {
      const key = s.cwd || '—'
      if (!map.has(key)) map.set(key, { name: s.cwdName || key, total: 0, settled: 0, active: 0, waiting: 0, done: 0 })
      const g = map.get(key)
      g.total++
      if (s.state === 'waiting') { g.active++; g.waiting++ }
      else if (s.state === 'working') g.active++
      else g.settled++
      g.done += s.doneSinceStart || 0
    }
    const out = [...map.values()]
    out.sort((a, b) => b.waiting - a.waiting || b.active - a.active || b.done - a.done)
    return out
  }, [sessions])

  return (
    <div className="rail">
      <section className="rail-block">
        <div className="rail-head"><span className="sq idle" />PROJECTS</div>
        <div className="proj-list">
          {projects.map((p) => {
            const pct = p.total ? Math.round((p.settled / p.total) * 100) : 0
            return (
              <div className="proj" key={p.name} title={`${p.settled}/${p.total} settled`}>
                <div className="proj-row">
                  <span className="proj-name">{p.name}</span>
                  <span className="proj-count">
                    {p.waiting > 0 && <span className="w">{p.waiting}!</span>}
                    {p.settled}/{p.total}
                  </span>
                </div>
                <div className="bar">
                  <span className="bar-fill" style={{ width: `${pct}%` }} />
                  {p.active > 0 && (
                    <span
                      className={`bar-active${p.waiting > 0 ? ' waiting' : ''}`}
                      style={{ width: `${(p.active / p.total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rail-block">
        <div className="rail-head"><span className="sq finished" />RECENTLY DONE</div>
        <div className="feed">
          {(!doneFeed || doneFeed.length === 0) && (
            <div className="feed-empty">No turns completed since the hub started yet.</div>
          )}
          {doneFeed?.map((e, i) => (
            <div className="feed-row" key={`${e.sessionId}-${e.ts}-${i}`}>
              <span className="feed-ico"><Icon.check /></span>
              <div className="feed-main">
                <div className="feed-title">{e.title}</div>
                <div className="feed-meta">
                  <span className="feed-proj">{e.project}</span>
                  {e.files > 0 && <span> · {e.files} files</span>}
                  <span> · {ago(now - e.ts)} ago</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
