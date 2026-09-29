import { useState } from 'react'
import { addNote, deleteNote, updateNote } from '../lib/store'
import { NOTE_COLORS, type Note } from '../lib/types'

const host = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function NotesBoard({ notes }: { notes: Note[] }) {
  const sorted = notes.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return (
    <section>
      <div className="section-head">
        <p className="hint">
          Los post-its con enlace aparecen pegados sobre esa pestaña en Chrome (con la extensión instalada).
        </p>
        <button className="btn primary" onClick={() => addNote()}>
          Nuevo post-it
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="empty">Aún no hay post-its.</p>
      ) : (
        <div className="board">
          {sorted.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </section>
  )
}

function NoteCard({ note }: { note: Note }) {
  const [text, setText] = useState(note.text)
  const [url, setUrl] = useState(note.url ?? '')
  const [confirming, setConfirming] = useState(false)

  const saveUrl = () => {
    let next = url.trim()
    if (next && !/^https?:\/\//i.test(next)) next = `https://${next}`
    setUrl(next)
    if (next !== (note.url ?? '')) updateNote(note.id, { url: next || null })
  }

  return (
    <article className={`note note-${note.color}`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== note.text && updateNote(note.id, { text })}
        placeholder="Escribe aquí…"
        aria-label="Texto del post-it"
      />
      <div className="note-link">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={saveUrl}
          placeholder="Enlace de la pestaña (opcional)"
          aria-label="Enlace vinculado"
          inputMode="url"
        />
        {note.url && (
          <a href={note.url} target="_blank" rel="noreferrer" title={note.page_title ?? note.url}>
            Abrir {host(note.url)}
          </a>
        )}
      </div>
      <div className="note-foot">
        <div className="swatches" role="group" aria-label="Color">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch note-${c}${c === note.color ? ' on' : ''}`}
              aria-label={c}
              aria-pressed={c === note.color}
              onClick={() => updateNote(note.id, { color: c })}
            />
          ))}
        </div>
        {note.url && (
          <button
            className="link-btn"
            onClick={() => updateNote(note.id, { match: note.match === 'page' ? 'site' : 'page' })}
            title="Dónde aparece el post-it"
          >
            {note.match === 'page' ? 'Solo esa página' : 'Todo el sitio'}
          </button>
        )}
        {confirming ? (
          <span className="confirm">
            <button className="link-btn" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button className="link-btn danger" onClick={() => deleteNote(note.id)}>
              Borrar
            </button>
          </span>
        ) : (
          <button className="link-btn danger" onClick={() => setConfirming(true)}>
            Borrar
          </button>
        )}
      </div>
    </article>
  )
}
