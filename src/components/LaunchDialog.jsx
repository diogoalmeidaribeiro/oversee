import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { Brackets } from './Brackets.jsx'

// A retro file-explorer for launching a session: type a path (cd-style) or click
// folders to navigate, make a new folder, then "launch here".
export function LaunchDialog({ onClose, onLaunched }) {
  const [data, setData] = useState(null) // { path, parent, home, folders, fileCount }
  const [pathDraft, setPathDraft] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const listRef = useRef(null)

  const navigate = async (p) => {
    setError(null)
    try {
      const q = p ? `?path=${encodeURIComponent(p)}` : ''
      const d = await (await fetch(`/api/fs${q}`)).json()
      if (d.error && !d.folders?.length) setError(d.error)
      setData(d)
      setPathDraft(d.path)
      if (listRef.current) listRef.current.scrollTop = 0
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => { navigate() }, []) // start at home

  const enter = (name) => navigate(join(data.path, name))

  const short = (p) => (data && p.startsWith(data.home) ? '~' + p.slice(data.home.length) : p)

  const makeFolder = async () => {
    const name = newName.trim()
    if (!name) return
    const d = await (await fetch('/api/mkdir', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: data.path, name }),
    })).json()
    if (d.error) { setError(d.error); return }
    setCreating(false); setNewName('')
    navigate(d.path) // hop into the new folder
  }

  const launch = async () => {
    setBusy(true); setError(null)
    try {
      const d = await (await fetch('/api/launch', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cwd: data.path }),
      })).json()
      if (d.error) throw new Error(d.error)
      onLaunched?.(d); onClose()
    } catch (e) {
      setError(String(e.message || e)); setBusy(false)
    }
  }

  const crumbs = data ? buildCrumbs(data.path, data.home) : []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal explorer" onClick={(e) => e.stopPropagation()}>
        <Brackets />
        <div className="explorer-titlebar">
          <span className="tb-dot" /><span className="tb-dot" /><span className="tb-dot" />
          <span className="tb-title">FILE EXPLORER — NEW SESSION</span>
        </div>

        {/* cd-style editable path */}
        <form className="path-bar" onSubmit={(e) => { e.preventDefault(); navigate(pathDraft) }}>
          <button
            type="button"
            className="path-up"
            title="Up one level"
            disabled={!data?.parent}
            onClick={() => data?.parent && navigate(data.parent)}
          >
            <Icon.levelUp />
          </button>
          <span className="prompt-mark">❯</span>
          <input
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="caret" />
        </form>

        {/* breadcrumbs */}
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="crumb-sep">/</span>}
              <button className="crumb" onClick={() => navigate(c.path)}>{c.label}</button>
            </span>
          ))}
        </div>

        {/* folder list */}
        <div className="explorer-list scanlines" ref={listRef}>
          {creating && (
            <div className="row new-row">
              <Icon.folderPlus />
              <input
                autoFocus
                className="new-folder-input"
                placeholder="new-folder-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') makeFolder(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                spellCheck={false}
              />
              <button className="row-go" onClick={makeFolder}>CREATE</button>
            </div>
          )}
          {data?.parent && (
            <button className="row up" onClick={() => navigate(data.parent)}>
              <Icon.levelUp /><span className="row-name">..</span>
            </button>
          )}
          {data?.folders?.map((name) => (
            <button className="row" key={name} onDoubleClick={() => enter(name)} onClick={() => enter(name)}>
              <Icon.folder /><span className="row-name">{name}</span>
            </button>
          ))}
          {data && data.folders.length === 0 && !data.parent && (
            <div className="row-empty">— empty —</div>
          )}
          {data && data.folders.length === 0 && data.parent && (
            <div className="row-empty">no sub-folders here{data.fileCount ? ` · ${data.fileCount} files` : ''}</div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="explorer-actions">
          <button className="ghost" onClick={() => setCreating((c) => !c)}>
            <Icon.folderPlus /> NEW FOLDER
          </button>
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>CANCEL</button>
          <button className="primary" disabled={busy || !data} onClick={launch}>
            {busy ? 'LAUNCHING…' : `▶ LAUNCH IN ${data ? baseName(data.path) : '…'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function join(p, name) {
  return p.endsWith('/') ? p + name : p + '/' + name
}
function baseName(p) {
  const b = p.replace(/\/+$/, '').split('/').pop()
  return b || '/'
}
function buildCrumbs(p, home) {
  const items = []
  let base, rel
  if (p === home || p.startsWith(home + '/')) {
    items.push({ label: '~', path: home })
    base = home; rel = p.slice(home.length)
  } else {
    items.push({ label: '/', path: '/' })
    base = '/'; rel = p
  }
  let acc = base
  for (const part of rel.split('/').filter(Boolean)) {
    acc = join(acc, part)
    items.push({ label: part, path: acc })
  }
  return items
}
