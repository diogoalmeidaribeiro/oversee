import { useState } from 'react'
import { Brackets } from './Brackets.jsx'
import { Icon } from './icons.jsx'
import { TerminalPane } from './TerminalPane.jsx'
import { fmt, ago, dur } from '../lib/format.js'

const MENU_W = 152

export function SessionCard({ s, onOpen, onKill, onDropTask, expanded, onToggle, showFolder = true, openTermName }) {
  // When this session is already open in the side drawer, don't also mount an
  // inline terminal for it — two live panes fight over the tmux window size and
  // garble redraw-heavy TUIs (e.g. Claude's selector menus).
  const openInDrawer = openTermName && openTermName === s.tmuxName
  const [git, setGit] = useState(null)
  const [menu, setMenu] = useState(null) // { top, left } in viewport coords, or null
  const [tab, setTab] = useState(s.hubOwned ? 'terminal' : 'ask') // expanded-body view
  const [draft, setDraft] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const hasTask = (e) => e.dataTransfer.types.includes('application/mc-task')
  const onDragOver = (e) => { if (hasTask(e)) { e.preventDefault(); setDragOver(true) } }
  const onDrop = (e) => {
    if (!hasTask(e)) return
    e.preventDefault()
    setDragOver(false)
    try {
      const task = JSON.parse(e.dataTransfer.getData('application/mc-task'))
      onDropTask?.(s, task)
    } catch { /* ignore */ }
  }

  const sendPrompt = (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !s.tmuxName) return
    fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tmuxName: s.tmuxName, text }),
    }).catch(() => {})
    setDraft('')
  }

  const openMenu = (e) => {
    e.stopPropagation()
    if (menu) { setMenu(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ top: Math.round(r.bottom + 5), left: Math.round(r.right - MENU_W) })
  }
  const finished = s.justFinished && s.state === 'idle'
  const stateClass = finished ? 'finished' : s.state

  // Metadata as icon + value chips.
  const metrics = []
  if (s.state === 'working' && s.activity) metrics.push({ icon: 'terminal', text: s.activity, hl: true })
  if (s.filesCount > 0) metrics.push({ icon: 'folder', text: s.filesCount, title: `${s.filesCount} files touched` })
  if (s.tokensOut > 0) metrics.push({ icon: 'tokens', text: fmt(s.tokensOut), title: `${s.tokensOut} output tokens` })
  if (s.lastTurn?.durationMs > 0) metrics.push({ icon: 'timer', text: dur(s.lastTurn.durationMs), title: 'last turn duration' })
  metrics.push({ icon: 'history', text: ago(s.ageMs), title: 'last active' })

  function loadGit() {
    if (git || !s.cwd) return
    fetch(`/api/git?cwd=${encodeURIComponent(s.cwd)}`)
      .then((r) => r.json())
      .then(setGit)
      .catch(() => setGit({ isRepo: false }))
  }

  const dropClass = dragOver ? (s.hubOwned ? ' drop-ok' : ' drop-block') : ''

  return (
    <div
      className={`card state-${stateClass}${dropClass}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <Brackets />
      {dragOver && (
        <div className="drop-hint">{s.hubOwned ? 'Drop to dispatch →' : 'Not a hub agent'}</div>
      )}
      <div className="card-head" onClick={() => { onToggle(); loadGit() }}>
        <div className="card-title">
          {showFolder && (
            <div className="folder">
              <span className="folder-name">{s.cwdName || s.cwd || '—'}</span>
              <span className={`dot ${stateClass}`} />
            </div>
          )}
          <div className="ai-title">
            <span className="ai-title-text">{s.title || s.lastPrompt || '…'}</span>
            {!showFolder && <span className={`dot ${stateClass}`} />}
          </div>
        </div>
        <button className="kebab" title="Actions" onClick={openMenu}>
          <Icon.kebab />
        </button>
        {menu && (
          <>
            <div className="menu-backdrop" onClick={(e) => { e.stopPropagation(); setMenu(null) }} />
            <div
              className="menu"
              style={{ top: menu.top, left: menu.left, width: MENU_W }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="menu-item danger" onClick={() => { setMenu(null); onKill?.(s) }}>
                <Icon.trash />
                {s.state === 'dead' ? 'Dismiss' : 'Kill session'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card-meta">
        {metrics.map((m, i) => {
          const Ico = Icon[m.icon]
          return (
            <span className={`metric${m.hl ? ' hl' : ''}`} key={i} title={m.title}>
              <Ico />
              {m.text}
            </span>
          )
        })}
      </div>

      {expanded && (
        <div className="card-body">
          {s.hubOwned && (
            <div className="body-tabs">
              <div className="seg small">
                <button className={tab === 'terminal' ? 'on' : ''} onClick={() => setTab('terminal')} title="Terminal">
                  <Icon.terminal />
                </button>
                <button className={tab === 'ask' ? 'on' : ''} onClick={() => setTab('ask')} title="Last ask">
                  <Icon.chat />
                </button>
              </div>
              {tab === 'terminal' && (
                <button className="icon expand-btn" title="Open to the side" onClick={() => onOpen(s)}>
                  <Icon.expand />
                </button>
              )}
            </div>
          )}

          {s.hubOwned && tab === 'terminal' ? (
            <div className="inline-term">
              <div className="term-preview">
                {openInDrawer ? (
                  <button className="term-open-elsewhere" onClick={() => onOpen(s)}>
                    <Icon.expand />
                    Open in the side panel →
                  </button>
                ) : (
                  <TerminalPane tmuxName={s.tmuxName} fontSize={8} />
                )}
              </div>
              <form className="term-input" onSubmit={sendPrompt}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a prompt, Enter to send…"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button type="submit" className="send-btn" title="Send" disabled={!draft.trim()}>
                  <Icon.send />
                </button>
              </form>
            </div>
          ) : (
            <>
              {s.lastPrompt && (
                <div className="prompt">
                  {!s.hubOwned && <div className="label">▪ Last ask</div>}
                  <div className="prompt-text">{s.lastPrompt}</div>
                </div>
              )}
              {git?.isRepo && (
                <div className="gitstat">
                  <span className="label">▪ Diff</span>{' '}
                  <span className="add">+{git.insertions}</span>{' '}
                  <span className="del">−{git.deletions}</span> · {git.filesChanged} files
                  {git.untracked ? ` · ${git.untracked} new` : ''}
                </div>
              )}
              {s.filesTouched?.length > 0 && (
                <div className="files">
                  {s.filesTouched.slice(-8).map((f) => (
                    <code key={f} title={f}>{f.split('/').pop()}</code>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="card-actions">
            {!s.hubOwned && <span className="hint sm">read-only · launch via hub to type here</span>}
            <span className="cwd-full">{s.cwd}</span>
          </div>
        </div>
      )}
    </div>
  )
}
