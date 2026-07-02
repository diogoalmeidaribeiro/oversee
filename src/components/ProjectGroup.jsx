import { SessionCard } from './SessionCard.jsx'

// A per-project group: an Eliza-style section header (square bullet, uppercase
// mono label, dot-separated summary on the right) over its session cards.
export function ProjectGroup({ group, collapsed, onToggleCollapse, expanded, onToggleCard, onOpen, onKill, onDropTask, openTermName }) {
  const summary = []
  if (group.waiting) summary.push(`${group.waiting} waiting`)
  if (group.working) summary.push(`${group.working} running`)
  if (group.finished) summary.push(`${group.finished} done`)
  summary.push(`${group.list.length} session${group.list.length === 1 ? '' : 's'}`)

  const bulletClass = group.waiting ? 'waiting' : group.working ? 'working' : group.finished ? 'finished' : 'idle'

  return (
    <section className="group">
      <header className="group-head" onClick={onToggleCollapse}>
        <span className={`sq ${bulletClass}`} />
        <span className="group-name">{group.name}</span>
        <span className="group-path">{group.cwd}</span>
        <span className="group-summary">{summary.join('  ·  ')}</span>
        <span className="group-chevron">{collapsed ? '+' : '–'}</span>
      </header>
      {!collapsed && (
        <div className="group-grid">
          {group.list.map((s) => (
            <SessionCard
              key={s.sessionId}
              s={s}
              showFolder={false}
              expanded={expanded.has(s.sessionId)}
              onToggle={() => onToggleCard(s.sessionId)}
              onOpen={onOpen}
              onKill={onKill}
              onDropTask={onDropTask}
              openTermName={openTermName}
            />
          ))}
        </div>
      )}
    </section>
  )
}
