import { useSyncExternalStore } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { urlKey, type Note, type Task } from './types'

interface State {
  mode: 'local' | 'cloud'
  ready: boolean
  session: Session | null
  tasks: Task[]
  notes: Note[]
  error: string | null
}

let state: State = {
  mode: supabase ? 'cloud' : 'local',
  ready: false,
  session: null,
  tasks: [],
  notes: [],
  error: null,
}

const listeners = new Set<() => void>()
let channel: RealtimeChannel | null = null

const cacheKey = (name: string) => `pt.${state.session?.user.id ?? 'local'}.${name}`

function readCache<T>(name: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(name)) ?? '[]')
  } catch {
    return []
  }
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  try {
    if (patch.tasks) localStorage.setItem(cacheKey('tasks'), JSON.stringify(state.tasks))
    if (patch.notes) localStorage.setItem(cacheKey('notes'), JSON.stringify(state.notes))
  } catch {
    // almacenamiento lleno o bloqueado: la app sigue funcionando en memoria
  }
  listeners.forEach((l) => l())
}

export function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const clearError = () => set({ error: null })

const online = () => (supabase && state.session ? supabase : null)

async function push(op: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await op
  if (error) set({ error: `No se pudo guardar: ${error.message}` })
}

function merge<T extends { id: string; updated_at: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id)
  if (i === -1) return [...list, row]
  if (list[i].updated_at > row.updated_at) return list
  const next = list.slice()
  next[i] = row
  return next
}

export async function refresh() {
  const sb = online()
  if (!sb) return
  const [tasks, notes] = await Promise.all([
    sb.from('tasks').select('*').order('created_at'),
    sb.from('notes').select('*').order('created_at'),
  ])
  if (tasks.error || notes.error) {
    set({ error: `No se pudo sincronizar: ${(tasks.error ?? notes.error)!.message}` })
    return
  }
  set({ tasks: tasks.data as Task[], notes: notes.data as Note[] })
}

function handleSession(session: Session | null) {
  const changed = session?.user.id !== state.session?.user.id
  state = { ...state, session }
  if (!changed) return set({ ready: true })

  channel?.unsubscribe()
  channel = null
  set({ ready: true, tasks: session ? readCache('tasks') : [], notes: session ? readCache('notes') : [] })
  if (!session || !supabase) return

  void refresh()
  channel = supabase
    .channel('sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => {
      if (p.eventType === 'DELETE') set({ tasks: state.tasks.filter((t) => t.id !== p.old.id) })
      else set({ tasks: merge(state.tasks, p.new as Task) })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (p) => {
      if (p.eventType === 'DELETE') set({ notes: state.notes.filter((n) => n.id !== p.old.id) })
      else set({ notes: merge(state.notes, p.new as Note) })
    })
    .subscribe()
}

export async function init() {
  if (!supabase) {
    set({ ready: true, tasks: readCache('tasks'), notes: readCache('notes') })
    return
  }
  const { data } = await supabase.auth.getSession()
  handleSession(data.session)
  supabase.auth.onAuthStateChange((_event, session) => handleSession(session))
  // En móvil el websocket se corta al pasar a segundo plano: resincroniza al volver.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh()
  })
}

const stamp = () => new Date().toISOString()

export function addTask(input: Pick<Task, 'title' | 'priority' | 'scope' | 'date'>): Task {
  const now = stamp()
  const task: Task = {
    id: crypto.randomUUID(),
    ...input,
    done: false,
    done_at: null,
    created_at: now,
    updated_at: now,
  }
  set({ tasks: [...state.tasks, task] })
  const sb = online()
  if (sb) void push(sb.from('tasks').insert(task))
  return task
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'user_id' | 'created_at'>>) {
  const full = { ...patch, updated_at: stamp() }
  if (patch.done !== undefined) full.done_at = patch.done ? full.updated_at : null
  set({ tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...full } : t)) })
  const sb = online()
  if (sb) void push(sb.from('tasks').update(full).eq('id', id))
}

export function deleteTask(id: string) {
  set({ tasks: state.tasks.filter((t) => t.id !== id) })
  const sb = online()
  if (sb) void push(sb.from('tasks').delete().eq('id', id))
}

export function addNote(input: Partial<Pick<Note, 'text' | 'color' | 'url' | 'match'>> = {}): Note {
  const now = stamp()
  const match = input.match ?? 'page'
  const note: Note = {
    id: crypto.randomUUID(),
    text: input.text ?? '',
    color: input.color ?? 'yellow',
    url: input.url ?? null,
    url_key: input.url ? urlKey(input.url, match) : null,
    match,
    page_title: null,
    x: 40,
    y: 120,
    w: 240,
    h: 200,
    collapsed: false,
    created_at: now,
    updated_at: now,
  }
  set({ notes: [...state.notes, note] })
  const sb = online()
  if (sb) void push(sb.from('notes').insert(note))
  return note
}

export function updateNote(id: string, patch: Partial<Omit<Note, 'id' | 'user_id' | 'created_at'>>) {
  const current = state.notes.find((n) => n.id === id)
  if (!current) return
  const full: Partial<Note> = { ...patch, updated_at: stamp() }
  if (patch.url !== undefined || patch.match !== undefined) {
    const url = patch.url !== undefined ? patch.url : current.url
    full.url_key = url ? urlKey(url, patch.match ?? current.match) : null
  }
  set({ notes: state.notes.map((n) => (n.id === id ? { ...n, ...full } : n)) })
  const sb = online()
  if (sb) void push(sb.from('notes').update(full).eq('id', id))
}

export function deleteNote(id: string) {
  set({ notes: state.notes.filter((n) => n.id !== id) })
  const sb = online()
  if (sb) void push(sb.from('notes').delete().eq('id', id))
}
