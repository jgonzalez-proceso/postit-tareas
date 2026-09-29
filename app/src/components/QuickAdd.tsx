import { useEffect, useRef, useState, type FormEvent } from 'react'
import { describeWhen, parseTask, PRIORITY_LABEL, type Priority, type Scope } from '../lib/parse'
import { addTask } from '../lib/store'
import { listen, voiceSupported } from '../lib/voice'

const PRIORITIES: Priority[] = ['low', 'medium', 'high']

interface Props {
  fallback: { scope: Scope; date: string | null }
  notify: (message: string) => void
}

export function QuickAdd({ fallback, notify }: Props) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<Priority | null>(null)
  const [listening, setListening] = useState(false)
  const stop = useRef<(() => void) | null>(null)

  useEffect(() => () => stop.current?.(), [])

  function add(raw: string) {
    if (!raw.trim()) return
    const parsed = parseTask(raw, new Date(), fallback)
    const task = addTask({ ...parsed, priority: priority ?? parsed.priority })
    const extra = task.priority ? ` · prioridad ${PRIORITY_LABEL[task.priority].toLowerCase()}` : ''
    notify(`Añadida para ${describeWhen(task.scope, task.date)}${extra}`)
    setText('')
    setPriority(null)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    add(text)
  }

  function toggleVoice() {
    if (listening) return stop.current?.()
    setListening(true)
    stop.current = listen({
      onInterim: setText,
      onFinal: add,
      onError: notify,
      onEnd: () => {
        setListening(false)
        stop.current = null
      },
    })
  }

  return (
    <form className="quickadd" onSubmit={submit}>
      <div className="quickadd-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? 'Te escucho…' : 'Nueva tarea — p. ej. «llamar a Ana mañana»'}
          aria-label="Nueva tarea"
          enterKeyHint="done"
        />
        {voiceSupported && (
          <button
            type="button"
            className={`icon-btn mic${listening ? ' on' : ''}`}
            onClick={toggleVoice}
            aria-label={listening ? 'Parar dictado' : 'Dictar tarea'}
            aria-pressed={listening}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Añadir
        </button>
      </div>
      <div className="chips" role="group" aria-label="Prioridad (opcional)">
        <span className="chips-label">Prioridad</span>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip prio-${p}${priority === p ? ' on' : ''}`}
            aria-pressed={priority === p}
            onClick={() => setPriority(priority === p ? null : p)}
          >
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>
    </form>
  )
}
