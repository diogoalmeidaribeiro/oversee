import { useState } from 'react'
import { Icon } from './icons.jsx'

// Akiflow-style task inbox. Add tasks, then drag one onto an agent card to
// dispatch it (that marks it in-progress). Tasks stay in the panel and carry a
// status: todo -> in_progress -> done. Click the checkbox to toggle done.
export function InboxPanel({ tasks, onAdd, onRemove, onUpdate }) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [tagFilter, setTagFilter] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    const t = draft.trim()
    if (!t) return
    onAdd(t)
    setDraft('')
  }

  const startEdit = (task) => {
    setEditingId(task.id)
    setEditDraft(task.text)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }
  const commitEdit = (task) => {
    const t = editDraft.trim()
    if (t && t !== task.text) onUpdate(task.id, { text: t })
    cancelEdit()
  }

  const onDragStart = (e, task) => {
    e.dataTransfer.setData('application/mc-task', JSON.stringify(task))
    e.dataTransfer.setData('text/plain', task.text)
    e.dataTransfer.effectAllowed = 'move'
  }

  const toggleDone = (task) =>
    onUpdate(task.id, { status: task.status === 'done' ? 'todo' : 'done' })

  const tags = [...new Set(tasks.flatMap((t) => extractTags(t.text)))].sort()
  const shown = tagFilter ? tasks.filter((t) => extractTags(t.text).includes(tagFilter)) : tasks

  return (
    <div className="inbox">
      <form className="add-task" onSubmit={submit}>
        <Icon.plus />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add new task"
          spellCheck={false}
          autoComplete="off"
        />
      </form>

      {tags.length > 0 && (
        <div className="tag-filter">
          <button
            className={`tag-chip${tagFilter === null ? ' active' : ''}`}
            onClick={() => setTagFilter(null)}
          >
            all
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              className={`tag-chip${tagFilter === tag ? ' active' : ''}`}
              style={{ '--tag-hue': tagHue(tag) }}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="task-list">
        {shown.map((task) => {
          const status = task.status || 'todo'
          const editing = editingId === task.id
          return (
            <div
              key={task.id}
              className={`task status-${status}${editing ? ' editing' : ''}`}
              draggable={status !== 'done' && !editing}
              onDragStart={(e) => onDragStart(e, task)}
              title={editing ? '' : status === 'done' ? '' : 'Drag onto an agent to dispatch · double-click to edit'}
            >
              <button
                className="task-check"
                onClick={() => toggleDone(task)}
                title={status === 'in_progress' ? (task.agent ? `In progress · ${task.agent}` : 'In progress') : 'Toggle done'}
              >
                {status === 'done' ? (
                  <Icon.check />
                ) : status === 'in_progress' ? (
                  <span className="task-spinner" />
                ) : (
                  <Icon.circle />
                )}
              </button>
              {editing ? (
                <input
                  className="task-edit"
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(task) }
                    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
              ) : (
                <span
                  className="task-text"
                  onDoubleClick={() => startEdit(task)}
                  title="Double-click to edit"
                >
                  {stripTags(task.text) || task.text}
                </span>
              )}
              {!editing && extractTags(task.text).map((tag) => (
                <span key={tag} className="task-tag" style={{ '--tag-hue': tagHue(tag) }}>
                  #{tag}
                </span>
              ))}
              {!editing && (
                <button className="task-x" onClick={() => onRemove(task.id)} title="Delete">
                  <Icon.close />
                </button>
              )}
              {!editing && <span className="task-grip"><Icon.grip /></span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// A tag is a #-prefixed run of word chars / hyphens, e.g. #lizzy or #buildity-ai.
const TAG_RE = /#[\w-]+/g

function extractTags(text) {
  return (text.match(TAG_RE) || []).map((t) => t.slice(1))
}

// The task label without its #tags (those render as chips on the right instead).
function stripTags(text) {
  return text.replace(TAG_RE, '').replace(/\s{2,}/g, ' ').trim()
}

function tagHue(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}
