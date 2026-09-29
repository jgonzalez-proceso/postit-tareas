// Interpreta una frase dictada o escrita ("llamar a Ana mañana prioridad alta")
// y extrae título, prioridad y fecha. Sin dependencias: este archivo se copia
// tal cual a supabase/functions/add-task/parse.ts para el atajo de Siri.

export type Priority = 'low' | 'medium' | 'high'
export type Scope = 'day' | 'week' | 'later'

export interface Parsed {
  title: string
  priority: Priority | null
  scope: Scope
  date: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'mi[eé]rcoles', 'jueves', 'viernes', 's[aá]bado']

const PRIORITY_WORDS: Record<string, Priority> = {
  alta: 'high',
  media: 'medium',
  mediana: 'medium',
  medio: 'medium',
  baja: 'low',
}

export function parseTask(
  raw: string,
  now: Date = new Date(),
  fallback: { scope: Scope; date: string | null } = { scope: 'day', date: isoDate(now) },
): Parsed {
  let text = raw.trim()
  let priority: Priority | null = null
  let when: { scope: Scope; date: string | null } | null = null

  // Quita el match (y un "para" que lo preceda) y lo devuelve.
  const take = (source: string, replacement = ' ') => {
    const re = new RegExp(`(?:\\bpara\\s+)?${source}`, 'i')
    const m = text.match(re)
    if (m) text = text.replace(re, replacement)
    return m
  }

  text = text.replace(
    /^(?:a[ñn]ade|a[ñn]adir|agrega|agregar|apunta|apuntar|anota|anotar|recu[eé]rdame|nueva tarea)\b[:,]?\s*(?:(?:una|la)\s+tarea\s*(?:de|para)?\s*|que\s+)?/i,
    '',
  )

  const pm = take('[,.]?\\s*(?:\\b(?:con|de)\\s+)?\\bprioridad\\s+(alta|media|mediana|medio|baja)\\b')
  if (pm) priority = PRIORITY_WORDS[pm[1].toLowerCase()]
  else if (take('[,.]?\\s*\\b(?:muy\\s+)?urgente\\b')) priority = 'high'

  const day = (n: number) => ({ scope: 'day' as Scope, date: isoDate(addDays(now, n)) })
  const week = (n: number) => ({ scope: 'week' as Scope, date: isoDate(addDays(mondayOf(now), n * 7)) })

  let m: RegExpMatchArray | null
  if (take('\\bpasado\\s+ma[ñn]ana\\b')) when = day(2)
  else if ((m = text.match(/\bma[ñn]ana\s+por\s+la\s+(ma[ñn]ana|tarde|noche)\b/i))) {
    text = text.replace(m[0], `por la ${m[1]}`)
    when = day(1)
  } else if (take('(?<!\\b(?:la|esta|de)\\s)\\bma[ñn]ana\\b')) when = day(1)
  else if (take('\\bhoy\\b')) when = day(0)
  else if (take('\\besta\\s+semana\\b')) when = week(0)
  else if (take('\\b(?:la\\s+)?(?:semana\\s+que\\s+viene|pr[oó]xima\\s+semana|semana\\s+pr[oó]xima)\\b'))
    when = week(1)
  else if ((m = take(`\\b(?:el\\s+|este\\s+)?(?:pr[oó]ximo\\s+)?(${WEEKDAYS.join('|')})\\b`))) {
    const idx = WEEKDAYS.findIndex((w) => new RegExp(`^${w}$`, 'i').test(m![1]))
    when = day((idx - now.getDay() + 7) % 7 || 7)
  } else if (take('\\b(?:alg[uú]n\\s+d[ií]a|m[aá]s\\s+adelante)\\b')) when = { scope: 'later', date: null }

  text = text
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .replace(/\s+(?:para|el|con|y|de)$/i, '')
    .trim()

  const title = text || raw.trim()
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    priority,
    ...(when ?? fallback),
  }
}

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Baja', medium: 'Media', high: 'Alta' }

export function describeWhen(scope: Scope, date: string | null, now: Date = new Date()): string {
  if (scope === 'later' || !date) return 'más adelante'
  if (scope === 'week') {
    const diff = Math.round((parseISO(date).getTime() - mondayOf(now).getTime()) / 6048e5)
    return diff === 0 ? 'esta semana' : diff === 1 ? 'la semana que viene' : `semana del ${formatDay(date)}`
  }
  const today = isoDate(now)
  if (date === today) return 'hoy'
  if (date === isoDate(addDays(now, 1))) return 'mañana'
  return formatDay(date)
}

export function formatDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) {
  return parseISO(date).toLocaleDateString('es-ES', opts)
}
