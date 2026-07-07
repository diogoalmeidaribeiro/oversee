import { useEffect, useMemo, useRef, useState } from 'react'
import { Logo } from '../src/components/Logo.jsx'
import { Icon } from '../src/components/icons.jsx'
import { FleetOverview } from '../src/components/FleetOverview.jsx'
import { ProjectGroup } from '../src/components/ProjectGroup.jsx'
import { SessionCard } from '../src/components/SessionCard.jsx'
import { Sidebar } from '../src/components/Sidebar.jsx'
import { MOCK_SESSIONS, MOCK_TASKS, MOCK_DONE_FEED } from './mockData.js'

const MOCK_W = 1200
function groupPrio(g) {
  if (g.waiting) return 0
  if (g.finished) return 1
  if (g.working) return 2
  return 3
}

// The real oversee dashboard, driven by canned data and local state — every
// interaction (expand a card, group/flat, minimize-all, edit/tag/complete a
// task, drag a task onto an agent) is the actual app UI, no server.
export function HeroMock() {
  const sessions = MOCK_SESSIONS
  const [tasks, setTasks] = useState(MOCK_TASKS)
  const [expanded, setExpanded] = useState(() => new Set(['a1']))
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [grouped, setGrouped] = useState(true)
  const [sideTab, setSideTab] = useState('inbox')

  const toggleCard = (id) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleCollapse = (cwd) => setCollapsed((p) => { const n = new Set(p); n.has(cwd) ? n.delete(cwd) : n.add(cwd); return n })
  const addTask = (text) => setTasks((t) => [...t, { id: Math.max(0, ...t.map((x) => x.id)) + 1, text, status: 'todo', agent: null }])
  const removeTask = (id) => setTasks((t) => t.filter((x) => x.id !== id))
  const updateTask = (id, patch) => setTasks((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const dropTask = (s, task) => updateTask(task.id, { status: 'in_progress', agent: s.cwdName })

  const groups = useMemo(() => {
    const map = new Map()
    for (const s of sessions) { const k = s.cwd || '—'; if (!map.has(k)) map.set(k, []); map.get(k).push(s) }
    return [...map.entries()]
      .map(([cwd, list]) => ({
        cwd, name: list[0].cwdName || cwd, list,
        waiting: list.filter((x) => x.state === 'waiting').length,
        working: list.filter((x) => x.state === 'working').length,
        finished: list.filter((x) => x.justFinished && x.state === 'idle').length,
      }))
      .sort((a, b) => groupPrio(a) - groupPrio(b))
  }, [sessions])

  // Scale the fixed-size app down to fit the hero container on any width.
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / MOCK_W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="mock-wrap" ref={wrapRef}>
      <div className="mock-scale" style={{ transform: `scale(${scale})`, height: 720 * scale }}>
        <div className="mock-app app" style={{ width: MOCK_W }}>
          <header className="topbar">
            <div className="brand"><Logo connected size={22} /><span className="brand-name">oversee</span></div>
            <div className="actions">
              <div className="seg">
                <button className={grouped ? 'on' : ''} onClick={() => setGrouped(true)} title="Grouped"><Icon.group /></button>
                <button className={!grouped ? 'on' : ''} onClick={() => setGrouped(false)} title="Flat"><Icon.grid /></button>
              </div>
              <span className="sep" />
              <button className="icon" disabled={expanded.size === 0} onClick={() => setExpanded(new Set())} title="Minimize all cards"><Icon.collapse /></button>
              <button className="icon on" title="Stats"><Icon.panelTop /></button>
              <button className="icon on" title="Side panel"><Icon.panelLeft /></button>
              <button className="icon" title="Sound"><Icon.bell /></button>
              <button className="primary">+ LAUNCH</button>
            </div>
          </header>

          <main className="layout">
            <div className="kpi-area"><FleetOverview sessions={sessions} /></div>
            <div className="body">
              <div className="rail-area">
                <Sidebar
                  tab={sideTab} setTab={setSideTab} tasks={tasks}
                  onAddTask={addTask} onRemoveTask={removeTask} onUpdateTask={updateTask}
                  sessions={sessions} doneFeed={MOCK_DONE_FEED} now={Date.now()}
                />
              </div>
              <div className="cards-area">
                {grouped ? (
                  groups.map((g) => (
                    <ProjectGroup
                      key={g.cwd} group={g} collapsed={collapsed.has(g.cwd)}
                      onToggleCollapse={() => toggleCollapse(g.cwd)} expanded={expanded}
                      onToggleCard={toggleCard} onOpen={() => {}} onKill={() => {}} onDropTask={dropTask}
                    />
                  ))
                ) : (
                  <div className="flat-grid">
                    {sessions.map((s) => (
                      <SessionCard
                        key={s.sessionId} s={s} expanded={expanded.has(s.sessionId)}
                        onToggle={() => toggleCard(s.sessionId)} onOpen={() => {}} onKill={() => {}} onDropTask={dropTask}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
