import type { Priority, Scope } from './parse'

export type { Priority, Scope }

export interface Task {
  id: string
  user_id?: string
  title: string
  priority: Priority | null
  scope: Scope
  // scope 'day': el día; scope 'week': el lunes de esa semana; scope 'later': null
  date: string | null
  done: boolean
  done_at: string | null
  // Orden manual (arrastrar). Si es null se usa la fecha de creación.
  position: number | null
  created_at: string
  updated_at: string
}

export const positionOf = (t: Task) => t.position ?? Date.parse(t.created_at)

export type NoteColor = 'yellow' | 'pink' | 'green' | 'blue' | 'orange'
export type NoteMatch = 'page' | 'site'

export interface Note {
  id: string
  user_id?: string
  text: string
  color: NoteColor
  url: string | null
  // Clave con la que la extensión decide en qué pestañas aparece:
  // origin + pathname (match 'page') u origin (match 'site')
  url_key: string | null
  match: NoteMatch
  page_title: string | null
  x: number
  y: number
  w: number
  h: number
  collapsed: boolean
  created_at: string
  updated_at: string
}

export const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'green', 'blue', 'orange']

export function urlKey(url: string, match: NoteMatch): string | null {
  try {
    const u = new URL(url)
    return match === 'site' ? u.origin : u.origin + u.pathname
  } catch {
    return null
  }
}
