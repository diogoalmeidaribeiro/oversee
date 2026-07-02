import { Icon } from './icons.jsx'
import { InboxPanel } from './InboxPanel.jsx'
import { NewsRail } from './NewsRail.jsx'

// Left sidebar, Akiflow-style: a tab switch between the task Inbox and the
// Projects/activity view.
export function Sidebar({ tab, setTab, tasks, onAddTask, onRemoveTask, onUpdateTask, sessions, doneFeed, now }) {
  return (
    <div className="sidebar">
      <div className="side-tabs">
        <button className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')} title="Inbox">
          <Icon.inbox />
          <span>INBOX</span>
          {tasks.length > 0 && <span className="side-badge">{tasks.length}</span>}
        </button>
        <button className={tab === 'projects' ? 'on' : ''} onClick={() => setTab('projects')} title="Projects">
          <Icon.group />
          <span>PROJECTS</span>
        </button>
      </div>

      <div className="side-body">
        {tab === 'inbox' ? (
          <InboxPanel tasks={tasks} onAdd={onAddTask} onRemove={onRemoveTask} onUpdate={onUpdateTask} />
        ) : (
          <NewsRail sessions={sessions} doneFeed={doneFeed} now={now} />
        )}
      </div>
    </div>
  )
}
