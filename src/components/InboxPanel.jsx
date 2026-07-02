import { useState } from 'react'
import { Icon } from './icons.jsx'

// Akiflow-style task inbox. Add tasks, then drag one onto an agent card to
// dispatch it (that marks it in-progress). Tasks stay in the panel and carry a
// status: todo -> in_progress -> done. Click the checkbox to toggle done.
export function InboxPanel({ tasks, onAdd, onRemove, onUpdate }) {
  const [draft, setDraft] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const t = draft.trim()
    if (!t) return
    onAdd(t)
    setDraft('')
  }

  const onDragStart = (e, task) => {
    e.dataTransfer.setData('application/mc-task', JSON.stringify(task))
    e.dataTransfer.setData('text/plain', task.text)
    e.dataTransfer.effectAllowed = 'move'
  }

  const toggleDone = (task) =>
    onUpdate(task.id, { status: task.status === 'done' ? 'todo' : 'done' })

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

      <div className="task-list">
        {tasks.map((task) => {
          const status = task.status || 'todo'
          return (
            <div
              key={task.id}
              className={`task status-${status}`}
              draggable={status !== 'done'}
              onDragStart={(e) => onDragStart(e, task)}
              title={status === 'done' ? '' : 'Drag onto an agent to dispatch'}
            >
              <button className="task-check" onClick={() => toggleDone(task)} title="Toggle done">
                {status === 'done' ? <Icon.check /> : <Icon.circle />}
              </button>
              <span className="task-text">{task.text}</span>
              {status === 'in_progress' && (
                <span className="task-status ip" title={task.agent ? `Dispatched to ${task.agent}` : 'In progress'}>
                  IN PROGRESS
                </span>
              )}
              <button className="task-x" onClick={() => onRemove(task.id)} title="Delete">
                <Icon.close />
              </button>
              <span className="task-grip"><Icon.grip /></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
