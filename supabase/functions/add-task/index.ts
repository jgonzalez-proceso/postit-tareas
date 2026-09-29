// Endpoint para el atajo de Siri.
//   POST { "text": "comprar pan mañana prioridad alta" }  -> crea la tarea
//   POST { "action": "list" }                             -> lee las tareas de hoy
// Autenticación propia: cabecera "Authorization: Bearer pt_..." con un token
// generado en la app (por eso se despliega con verify_jwt = false).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { describeWhen, isoDate, parseTask, PRIORITY_LABEL } from './parse.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const say = (message: string, status = 200) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return say('Método no permitido.', 405)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token?.startsWith('pt_')) return say('Falta el token.', 401)

  const { data: row } = await admin
    .from('api_tokens')
    .select('id, user_id')
    .eq('token_hash', await sha256(token))
    .maybeSingle()
  if (!row) return say('Token no válido.', 401)

  const body = await req.json().catch(() => ({}))
  const tz = typeof body.tz === 'string' ? body.tz : 'Europe/Madrid'
  let now: Date
  try {
    now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  } catch {
    return say('Zona horaria no válida.', 400)
  }

  await admin.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)

  if (body.action === 'list') {
    const { data, error } = await admin
      .from('tasks')
      .select('title')
      .eq('user_id', row.user_id)
      .eq('scope', 'day')
      .eq('done', false)
      .lte('date', isoDate(now))
      .order('created_at')
    if (error) return say('No he podido leer las tareas.', 500)
    if (!data.length) return say('No tienes tareas pendientes para hoy.')
    return say(`Tienes ${data.length} pendientes: ${data.map((t) => t.title).join('; ')}.`)
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return say('No he recibido ninguna tarea.', 400)

  const parsed = parseTask(text, now)
  const { error } = await admin.from('tasks').insert({ ...parsed, user_id: row.user_id })
  if (error) return say('No he podido guardar la tarea.', 500)

  const prio = parsed.priority ? `, prioridad ${PRIORITY_LABEL[parsed.priority].toLowerCase()}` : ''
  return say(`Añadida «${parsed.title}» para ${describeWhen(parsed.scope, parsed.date, now)}${prio}.`)
})
