import { useState } from 'react'
import { addDays, isoDate, mondayOf, PRIORITY_LABEL, type Priority } from '../lib/parse'
import { deleteTask, updateTask } from '../lib/store'
import type { Task } from '../lib/types'

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const rank = (t: Task) => (t.priority ? RANK[t.priority] : 3)

export const sortTasks = (tasks: Task[]) =>
  tasks
    .slice()
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) || rank(a) - rank(b) || a.created_at.localeCompare(b.created_at),
    )

export function isOverdue(t: Task, today: string, monday: string) {
  if (t.done || !t.date) return false
  return t.scope === 'day' ? t.date < today : t.scope === 'week' ? t.date < monday : false
}

interface ListProps {
  tasks: Task[]
  empty?: string
}

export function TaskList({ tasks, empty }: ListProps) {
  const [open, setOpen] = useState<string | null>(null)
  if (!tasks.length) return empty ? <p className="empty">{empty}</p> : null
  return (
    <ul className="tasks">
      {sortTasks(tasks).map((t) => (
        <TaskRow key={t.id} task={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
      ))}
    </ul>
  )
}

function TaskRow({ task, open, onToggle }: { task: Task; open: boolean; onToggle: () => void }) {
  const now = new Date()
  const today = isoDate(now)
  const monday = isoDate(mondayOf(now))
  const overdue = isOverdue(task, today, monday)

  return (
    <li className={`task${task.done ? ' done' : ''}${open ? ' open' : ''}`}>
      <div className="task-main">
        <button
          className="check"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? 'Marcar como no hecha' : 'Marcar como hecha'}
          onClick={() => updateTask(task.id, { done: !task.done })}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </button>
        <button className="task-body" onClick={onToggle} aria-expanded={open}>
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            {task.priority && <span className={`badge prio-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>}
            {overdue && <span className="badge overdue">Atrasada</span>}
          </span>
        </button>
      </div>
      {open && <TaskEditor task={task} today={today} monday={monday} />}
    </li>
  )
}

function TaskEditor({ task, today, monday }: { task: Task; today: string; monday: string }) {
  const [title, setTitle] = useState(task.title)
  const [confirming, setConfirming] = useState(false)
  const tomorrow = isoDate(addDays(new Date(), 1))

  const saveTitle = () => {
    const t = title.trim()
    if (t && t !== task.title) updateTask(task.id, { title: t })
    else setTitle(task.title)
  }

  const is = (scope: Task['scope'], date: string | null) => task.scope === scope && task.date === date
  const moves: [string, Task['scope'], string | null][] = [
    ['Hoy', 'day', today],
    ['Mañana', 'day', tomorrow],
    ['Esta semana', 'week', monday],
    ['Más adelante', 'later', null],
  ]
  const priorities: [string, Priority | null][] = [
    ['Ninguna', null],
    ['Baja', 'low'],
    ['Media', 'medium'],
    ['Alta', 'high'],
  ]

  return (
    <div className="editor">
      <input
        className="editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Título de la tarea"
      />
      <div className="editor-group">
        <span className="chips-label">Prioridad</span>
        {priorities.map(([label, p]) => (
          <button
            key={label}
            className={`chip${p ? ` prio-${p}` : ''}${task.priority === p ? ' on' : ''}`}
            aria-pressed={task.priority === p}
            onClick={() => updateTask(task.id, { priority: p })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="editor-group">
        <span className="chips-label">Cuándo</span>
        {moves.map(([label, scope, date]) => (
          <button
            key={label}
            className={`chip${is(scope, date) ? ' on' : ''}`}
            aria-pressed={is(scope, date)}
            onClick={() => updateTask(task.id, { scope, date })}
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          className="chip date"
          value={task.scope === 'day' && task.date ? task.date : ''}
          onChange={(e) => e.target.value && updateTask(task.id, { scope: 'day', date: e.target.value })}
          aria-label="Otro día"
        />
      </div>
      <div className="editor-group end">
        {confirming ? (
          <>
            <span className="chips-label">¿Borrar la tarea?</span>
            <button className="chip" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button className="chip danger on" onClick={() => deleteTask(task.id)}>
              Borrar
            </button>
          </>
        ) : (
          <button className="chip danger" onClick={() => setConfirming(true)}>
            Borrar
          </button>
        )}
      </div>
    </div>
  )
}
