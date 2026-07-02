import { useMemo } from 'react'
import { Icon } from './icons.jsx'
import { fmt } from '../lib/format.js'

// Full-width KPI strip. Instant counts (needs you / running / queued) reflect the
// current fleet; throughput counts (done / files / tokens) are "since the hub
// started" — accumulated from live transcript tailing.
export function FleetOverview({ sessions }) {
  const kpi = useMemo(() => {
    let needsYou = 0, running = 0, done = 0, files = 0, tokens = 0, queued = 0
    for (const s of sessions) {
      if (s.state === 'waiting') needsYou++
      if (s.state === 'working') running++
      done += s.doneSinceStart || 0
      files += s.filesSinceStart || 0
      tokens += s.tokensSinceStart || 0
      queued += s.queued || 0
    }
    return { needsYou, running, done, files, tokens, queued }
  }, [sessions])

  const tiles = [
    { icon: 'alert', label: 'NEEDS YOU', value: kpi.needsYou, cls: kpi.needsYou ? 'waiting' : 'muted' },
    { icon: 'play', label: 'RUNNING', value: kpi.running, cls: kpi.running ? 'working' : 'muted' },
    { icon: 'check', label: 'DONE', value: kpi.done, cls: 'green', sub: 'since start' },
    { icon: 'folder', label: 'FILES', value: fmt(kpi.files), cls: 'muted', sub: 'since start' },
    { icon: 'tokens', label: 'TOKENS', value: fmt(kpi.tokens), cls: 'muted', sub: 'since start' },
    { icon: 'queue', label: 'QUEUED', value: kpi.queued, cls: kpi.queued ? 'amberish' : 'muted' },
  ]

  return (
    <div className="kpi-strip">
      {tiles.map((t) => {
        const Ico = Icon[t.icon]
        return (
          <div className={`kpi ${t.cls}`} key={t.label}>
            <span className="kpi-ico"><Ico /></span>
            <span className="kpi-value">{t.value}</span>
            <span className="kpi-label">{t.label}</span>
            {t.sub && <span className="kpi-sub">{t.sub}</span>}
          </div>
        )
      })}
    </div>
  )
}
