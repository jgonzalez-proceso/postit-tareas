import { useEffect, useRef, useState } from 'react'
import { Account, LoginForm } from './components/Account'
import { NotesBoard } from './components/NotesBoard'
import { QuickAdd } from './components/QuickAdd'
import { isOverdue, TaskList } from './components/TaskList'
import { addDays, formatDay, isoDate, mondayOf, parseISO, type Scope } from './lib/parse'
import { clearError, useStore } from './lib/store'
import type { Task } from './lib/types'

type View = 'day' | 'week' | 'later' | 'notes'

const VIEWS: [View, string][] = [
  ['day', 'Día'],
  ['week', 'Semana'],
  ['later', 'Más adelante'],
  ['notes', 'Post-its'],
]

function Progress({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return null
  const done = tasks.filter((t) => t.done).length
  return (
    <div className="progress" aria-label={`${done} de ${tasks.length} hechas`}>
      <div className="progress-bar">
        <span style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      <span className="progress-text">
        {done}/{tasks.length} hechas
      </span>
    </div>
  )
}

function Stepper(props: { label: string; onPrev: () => void; onNext: () => void; onReset?: () => void; resetLabel: string }) {
  return (
    <div className="stepper">
      <button className="icon-btn" onClick={props.onPrev} aria-label="Anterior">
        ‹
      </button>
      <h2>{props.label}</h2>
      <button className="icon-btn" onClick={props.onNext} aria-label="Siguiente">
        ›
      </button>
      {props.onReset && (
        <button className="chip" onClick={props.onReset}>
          {props.resetLabel}
        </button>
      )}
    </div>
  )
}

export default function App() {
  const { ready, mode, session, tasks, notes, error } = useStore()
  const [view, setView] = useState<View>('day')
  const [day, setDay] = useState(() => isoDate(new Date()))
  const [week, setWeek] = useState(() => isoDate(mondayOf(new Date())))
  const [account, setAccount] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = (message: string) => {
    setToast(message)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (error) {
      notify(error)
      clearError()
    }
  }, [error])

  if (!ready) return <div className="splash">Cargando…</div>

  if (mode === 'cloud' && !session) {
    return (
      <main className="auth">
        <img src="/icon.svg" alt="" width="72" height="72" />
        <h1>Postit Tareas</h1>
        <p>Entra para ver tus tareas en todos tus dispositivos.</p>
        <LoginForm />
      </main>
    )
  }

  const today = isoDate(new Date())
  const monday = isoDate(mondayOf(new Date()))

  const dayTasks = tasks.filter(
    (t) => t.scope === 'day' && (t.date === day || (day === today && isOverdue(t, today, monday))),
  )
  const weekTasks = tasks.filter(
    (t) => t.scope === 'week' && (t.date === week || (week === monday && isOverdue(t, today, monday))),
  )
  const weekDays = Array.from({ length: 7 }, (_, i) => isoDate(addDays(parseISO(week), i)))
  const laterTasks = tasks.filter((t) => t.scope === 'later')

  const fallback: { scope: Scope; date: string | null } =
    view === 'week' ? { scope: 'week', date: week } : view === 'later' ? { scope: 'later', date: null } : { scope: 'day', date: day }

  const dayLabel =
    day === today ? 'Hoy' : day === isoDate(addDays(new Date(), 1)) ? 'Mañana' : day === isoDate(addDays(new Date(), -1)) ? 'Ayer' : formatDay(day)
  const weekLabel =
    week === monday
      ? 'Esta semana'
      : `${formatDay(week, { day: 'numeric', month: 'short' })} – ${formatDay(weekDays[6], { day: 'numeric', month: 'short' })}`

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src="/icon.svg" alt="" width="32" height="32" />
          <div>
            <h1>Postit Tareas</h1>
            <p>{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <button className="chip" onClick={() => setAccount(true)}>
          {mode === 'local' ? 'Modo local' : 'Cuenta'}
        </button>
      </header>

      <nav className="tabs" aria-label="Vistas">
        {VIEWS.map(([v, label]) => (
          <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {view !== 'notes' && <QuickAdd fallback={fallback} notify={notify} />}

        {view === 'day' && (
          <section>
            <Stepper
              label={dayLabel}
              onPrev={() => setDay(isoDate(addDays(parseISO(day), -1)))}
              onNext={() => setDay(isoDate(addDays(parseISO(day), 1)))}
              onReset={day !== today ? () => setDay(today) : undefined}
              resetLabel="Ir a hoy"
            />
            <Progress tasks={dayTasks} />
            <TaskList tasks={dayTasks} empty="Nada apuntado para este día." />
          </section>
        )}

        {view === 'week' && (
          <section>
            <Stepper
              label={weekLabel}
              onPrev={() => setWeek(isoDate(addDays(parseISO(week), -7)))}
              onNext={() => setWeek(isoDate(addDays(parseISO(week), 7)))}
              onReset={week !== monday ? () => setWeek(monday) : undefined}
              resetLabel="Esta semana"
            />
            <Progress tasks={[...weekTasks, ...tasks.filter((t) => t.scope === 'day' && t.date && weekDays.includes(t.date))]} />
            <h3 className="sub">Objetivos de la semana</h3>
            <TaskList tasks={weekTasks} empty="Sin objetivos para esta semana." />
            <div className="week-grid">
              {weekDays.map((d) => {
                const list = tasks.filter((t) => t.scope === 'day' && t.date === d)
                return (
                  <div key={d} className={`week-day${d === today ? ' today' : ''}`}>
                    <button
                      className="week-day-head"
                      onClick={() => {
                        setDay(d)
                        setView('day')
                      }}
                    >
                      {formatDay(d, { weekday: 'short', day: 'numeric' })}
                    </button>
                    <TaskList tasks={list} />
                    {!list.length && <p className="empty small">—</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {view === 'later' && (
          <section>
            <div className="stepper">
              <h2>Más adelante</h2>
            </div>
            <TaskList tasks={laterTasks} empty="Nada pendiente para más adelante." />
          </section>
        )}

        {view === 'notes' && <NotesBoard notes={notes} />}
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {account && <Account onClose={() => setAccount(false)} />}
    </div>
  )
}
