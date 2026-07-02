import { useEffect, useMemo, useState } from 'react'
import { useControlSocket } from './ws/useControlSocket.js'
import { SessionCard } from './components/SessionCard.jsx'
import { ProjectGroup } from './components/ProjectGroup.jsx'
import { TerminalPane } from './components/TerminalPane.jsx'
import { LaunchDialog } from './components/LaunchDialog.jsx'
import { Brackets } from './components/Brackets.jsx'
import { FleetOverview } from './components/FleetOverview.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { Icon } from './components/icons.jsx'
import { Logo } from './components/Logo.jsx'
import { ConfirmDialog } from './components/ConfirmDialog.jsx'
import { updateTabTitle } from './notify/tabTitle.js'

function usePersisted(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s == null ? initial : JSON.parse(s)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
  }, [key, v])
  return [v, setV]
}

function groupPrio(g) {
  if (g.waiting) return 0
  if (g.finished) return 1
  if (g.working) return 2
  return 3
}

export default function App() {
  const { snapshot, connected } = useControlSocket()
  const [expanded, setExpanded] = useState(() => new Set())
  const [openTerm, setOpenTerm] = useState(null)
  const [showLaunch, setShowLaunch] = useState(false)
  const [confirmKill, setConfirmKill] = useState(null)
  const [muted, setMuted] = usePersisted('mc.muted', false)
  const [grouped, setGrouped] = usePersisted('mc.grouped', true)
  const [showKpi, setShowKpi] = usePersisted('mc.showKpi', true)
  const [showRail, setShowRail] = usePersisted('mc.showRail', true)
  const [sideTab, setSideTab] = usePersisted('mc.sideTab', 'inbox')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const sessions = snapshot.sessions || []
  const doneFeed = snapshot.overview?.doneFeed || []
  const tasks = snapshot.tasks || []

  const addTask = (text) =>
    fetch('/api/tasks/add', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {})
  const removeTask = (id) =>
    fetch('/api/tasks/remove', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  const updateTask = (id, patch) =>
    fetch('/api/tasks/update', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    }).catch(() => {})

  // Drag a task onto an agent card -> dispatch it and mark it in-progress (the
  // task stays in the inbox with its new status).
  const dropTask = (s, task) => {
    if (!s.hubOwned || !s.tmuxName) return // only hub agents can be driven
    fetch('/api/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tmuxName: s.tmuxName, text: task.text }),
    }).catch(() => {})
    updateTask(task.id, { status: 'in_progress', agent: s.cwdName })
    if (!openTerm) setOpenTerm(s) // pop the terminal so you see it working
  }

  const attention = useMemo(
    () => sessions.filter((s) => s.state === 'waiting' || (s.justFinished && s.state === 'idle')).length,
    [sessions],
  )
  useEffect(() => { updateTabTitle(attention, muted) }, [attention, muted])

  const groups = useMemo(() => {
    const map = new Map()
    for (const s of sessions) {
      const key = s.cwd || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    }
    const out = [...map.entries()].map(([cwd, list]) => ({
      cwd,
      name: list[0].cwdName || cwd,
      list,
      waiting: list.filter((x) => x.state === 'waiting').length,
      working: list.filter((x) => x.state === 'working').length,
      finished: list.filter((x) => x.justFinished && x.state === 'idle').length,
    }))
    out.sort((a, b) => groupPrio(a) - groupPrio(b) || b.list.length - a.list.length)
    return out
  }, [sessions])

  const openSession = openTerm ? sessions.find((s) => s.tmuxName === openTerm.tmuxName) : null

  const toggleCard = (id) =>
    setExpanded((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleCollapse = (cwd) =>
    setCollapsed((p) => {
      const n = new Set(p)
      n.has(cwd) ? n.delete(cwd) : n.add(cwd)
      return n
    })

  // Kill flow goes through a styled confirmation popup.
  const handleKill = (s) => setConfirmKill(s)

  const doKill = () => {
    const s = confirmKill
    if (!s) return
    const body = s.hubOwned
      ? { tmuxName: s.tmuxName }
      : { pid: s.pid, dead: s.state === 'dead' }
    fetch('/api/kill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})
    if (openTerm && openTerm.tmuxName === s.tmuxName) setOpenTerm(null)
    setConfirmKill(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo connected={connected} size={22} />
          <span className="brand-name">oversee</span>
        </div>

        <div className="actions">
          <div className="seg">
            <button className={grouped ? 'on' : ''} onClick={() => setGrouped(true)} title="Grouped by project">
              <Icon.group />
            </button>
            <button className={!grouped ? 'on' : ''} onClick={() => setGrouped(false)} title="Flat list">
              <Icon.grid />
            </button>
          </div>
          <span className="sep" />
          <button
            className={`icon${showKpi ? ' on' : ''}`}
            onClick={() => setShowKpi((v) => !v)}
            title={showKpi ? 'Hide stats strip' : 'Show stats strip'}
          >
            <Icon.panelTop />
          </button>
          <button
            className={`icon${showRail ? ' on' : ''}`}
            onClick={() => setShowRail((v) => !v)}
            title={showRail ? 'Hide side panel' : 'Show side panel'}
          >
            <Icon.panelLeft />
          </button>
          <button className="icon" onClick={() => setMuted((m) => !m)} title={muted ? 'Sound off' : 'Sound on'}>
            {muted ? <Icon.bellOff /> : <Icon.bell />}
          </button>
          <button
            className="primary"
            disabled={!snapshot.tmuxAvailable}
            title={snapshot.tmuxAvailable ? 'Launch a new Claude session' : 'tmux not available'}
            onClick={() => setShowLaunch(true)}
          >
            + LAUNCH
          </button>
        </div>
      </header>

      <main className="layout">
        {showKpi && (
          <div className="kpi-area">
            <FleetOverview sessions={sessions} />
          </div>
        )}

        <div className="body">
          {showRail && (
            <div className="rail-area">
              <Sidebar
                tab={sideTab}
                setTab={setSideTab}
                tasks={tasks}
                onAddTask={addTask}
                onRemoveTask={removeTask}
                onUpdateTask={updateTask}
                sessions={sessions}
                doneFeed={doneFeed}
                now={now}
              />
            </div>
          )}

          <div className="cards-area">
            {sessions.length === 0 && (
              <div className="empty">
                <Brackets />
                No Claude sessions found yet. Open a <code>claude</code> terminal, or launch one.
              </div>
            )}

            {grouped ? (
              groups.map((g) => (
                <ProjectGroup
                  key={g.cwd}
                  group={g}
                  collapsed={collapsed.has(g.cwd)}
                  onToggleCollapse={() => toggleCollapse(g.cwd)}
                  expanded={expanded}
                  onToggleCard={toggleCard}
                  onOpen={setOpenTerm}
                  onKill={handleKill}
                  onDropTask={dropTask}
                />
              ))
            ) : (
              <div className="flat-grid">
                {sessions.map((s) => (
                  <SessionCard
                    key={s.sessionId}
                    s={s}
                    expanded={expanded.has(s.sessionId)}
                    onToggle={() => toggleCard(s.sessionId)}
                    onOpen={setOpenTerm}
                    onKill={handleKill}
                    onDropTask={dropTask}
                  />
                ))}
              </div>
            )}
          </div>

          {openSession && (
            <aside className="drawer">
              <Brackets />
              <div className="drawer-head">
                <div>
                  <div className="folder">{openSession.cwdName}</div>
                  <div className="ai-title">{openSession.title || openSession.lastPrompt || ''}</div>
                </div>
                <div className="drawer-actions">
                  <button className="ghost sm" onClick={() => handleKill(openSession)} title="End this session">END</button>
                  <button className="icon" onClick={() => setOpenTerm(null)} title="Close view"><Icon.close /></button>
                </div>
              </div>
              <TerminalPane tmuxName={openSession.tmuxName} />
            </aside>
          )}
        </div>
      </main>

      {showLaunch && (
        <LaunchDialog
          onClose={() => setShowLaunch(false)}
          onLaunched={(info) => info?.name && setOpenTerm({ tmuxName: info.name, cwdName: info.cwd })}
        />
      )}

      {confirmKill && (
        <ConfirmDialog
          title={confirmKill.state === 'dead' ? 'Dismiss ended session' : 'Kill session'}
          message={
            confirmKill.state === 'dead'
              ? `Remove the stale entry for ${confirmKill.cwdName}? It has already ended.`
              : `This stops the claude process for “${confirmKill.title || confirmKill.cwdName}”. Any unsaved work in that session is lost.`
          }
          confirmLabel={confirmKill.state === 'dead' ? 'Dismiss' : 'Kill session'}
          danger={confirmKill.state !== 'dead'}
          onConfirm={doKill}
          onCancel={() => setConfirmKill(null)}
        />
      )}
    </div>
  )
}
