import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { addDays, isoDate, mondayOf, PRIORITY_LABEL, type Priority } from '../lib/parse'
import { deleteTask, reorderTasks, updateTask } from '../lib/store'
import { positionOf, type Task } from '../lib/types'

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const rank = (t: Task) => (t.priority ? RANK[t.priority] : 3)

// Orden de la lista: pendientes antes que hechas, y dentro el orden manual.
export const sortTasks = (tasks: Task[]) =>
  tasks.slice().sort((a, b) => Number(a.done) - Number(b.done) || positionOf(a) - positionOf(b))

export const sortByPriority = (tasks: Task[]) =>
  tasks.slice().sort((a, b) => rank(a) - rank(b) || positionOf(a) - positionOf(b))

export function isOverdue(t: Task, today: string, monday: string) {
  if (t.done || !t.date) return false
  return t.scope === 'day' ? t.date < today : t.scope === 'week' ? t.date < monday : false
}

export function PrioritySortButton({ tasks }: { tasks: Task[] }) {
  const pending = tasks.filter((t) => !t.done)
  if (pending.length < 2) return null
  return (
    <button className="chip" onClick={() => reorderTasks(sortByPriority(pending))}>
      Ordenar por prioridad
    </button>
  )
}

interface Drag {
  id: string
  from: number
  to: number
}

const moveItem = <T,>(list: T[], from: number, to: number) => {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

interface ListProps {
  tasks: Task[]
  empty?: string
}

export function TaskList({ tasks, empty }: ListProps) {
  const [open, setOpen] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const sorted = useMemo(() => sortTasks(tasks), [tasks])

  if (!sorted.length) return empty ? <p className="empty">{empty}</p> : null

  const display = drag ? moveItem(sorted, drag.from, drag.to) : sorted

  function start(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const from = sorted.findIndex((t) => t.id === id)
    setDrag({ id, from, to: from })
    setOpen(null)
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || !listRef.current) return
    const items = Array.from(listRef.current.children) as HTMLElement[]
    const dragged = sorted[drag.from]
    // Solo se reordena dentro del mismo grupo (pendientes o hechas).
    let to = 0
    let first = -1
    let last = -1
    display.forEach((t, i) => {
      if (t.done !== dragged.done) return
      if (first === -1) first = i
      last = i
      if (t.id === drag.id) return
      const r = items[i].getBoundingClientRect()
      if (e.clientY > r.top + r.height / 2) to++
    })
    to += first
    to = Math.max(first, Math.min(last, to))
    if (to !== drag.to) setDrag({ ...drag, to })
  }

  function end() {
    if (!drag) return
    if (drag.to !== drag.from) {
      const prev = display[drag.to - 1]
      const next = display[drag.to + 1]
      const dragged = sorted[drag.from]
      const before = prev && prev.done === dragged.done ? positionOf(prev) : null
      const after = next && next.done === dragged.done ? positionOf(next) : null
      let position: number
      if (before !== null && after !== null) position = (before + after) / 2
      else if (before !== null) position = before + 1000
      else if (after !== null) position = after - 1000
      else position = Date.now()
      // Sin hueco entre vecinos: renumera todo el grupo.
      if ((before !== null && position <= before) || (after !== null && position >= after)) {
        reorderTasks(display.filter((t) => t.done === dragged.done))
      } else {
        updateTask(drag.id, { position })
      }
    }
    setDrag(null)
  }

  return (
    <ul className={`tasks${drag ? ' reordering' : ''}`} ref={listRef}>
      {display.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          open={open === t.id}
          dragging={drag?.id === t.id}
          onToggle={() => setOpen(open === t.id ? null : t.id)}
          handle={{
            onPointerDown: (e) => start(e, t.id),
            onPointerMove: move,
            onPointerUp: end,
            onPointerCancel: end,
          }}
        />
      ))}
    </ul>
  )
}

interface RowProps {
  task: Task
  open: boolean
  dragging: boolean
  onToggle: () => void
  handle: {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
}

function TaskRow({ task, open, dragging, onToggle, handle }: RowProps) {
  const now = new Date()
  const today = isoDate(now)
  const monday = isoDate(mondayOf(now))
  const overdue = isOverdue(task, today, monday)

  return (
    <li className={`task${task.done ? ' done' : ''}${open ? ' open' : ''}${dragging ? ' dragging' : ''}`}>
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
        <button className="handle" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar" {...handle}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.8" />
            <circle cx="15" cy="6" r="1.8" />
            <circle cx="9" cy="12" r="1.8" />
            <circle cx="15" cy="12" r="1.8" />
            <circle cx="9" cy="18" r="1.8" />
            <circle cx="15" cy="18" r="1.8" />
          </svg>
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
