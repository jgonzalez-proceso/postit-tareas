import { useState, type FormEvent } from 'react'
import { supabase, SUPABASE_URL } from '../lib/supabase'
import { useStore } from '../lib/store'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run(action: 'in' | 'up', e?: FormEvent) {
    e?.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { data, error } =
      action === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMessage(error.message)
    else if (action === 'up' && !data.session) setMessage('Revisa tu correo para confirmar la cuenta.')
  }

  return (
    <form className="login" onSubmit={(e) => run('in', e)}>
      <label>
        Email
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {message && <p className="form-msg">{message}</p>}
      <p className="hint">La sesión queda guardada en este dispositivo; no hará falta volver a entrar.</p>
      <div className="login-actions">
        <button className="btn primary" disabled={busy}>
          Entrar
        </button>
        <button type="button" className="btn" disabled={busy || !email || password.length < 8} onClick={() => run('up')}>
          Crear cuenta
        </button>
      </div>
    </form>
  )
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function SiriSetup() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const endpoint = `${SUPABASE_URL}/functions/v1/add-task`

  async function generate() {
    if (!supabase) return
    setError(null)
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    const value = 'pt_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    // Un solo token activo: generar uno nuevo invalida el anterior.
    await supabase.from('api_tokens').delete().eq('name', 'Siri')
    const { error } = await supabase.from('api_tokens').insert({ name: 'Siri', token_hash: await sha256(value) })
    if (error) setError(error.message)
    else setToken(value)
  }

  return (
    <div className="siri">
      <h3>Siri y Atajos</h3>
      <p>
        Crea en el iPhone un atajo llamado «Añadir tarea» con dos acciones: <b>Dictar texto</b> y{' '}
        <b>Obtener contenido de URL</b> (método POST, cuerpo JSON con el campo <code>text</code> = texto dictado, y
        cabecera <code>Authorization</code> = <code>Bearer</code> + tu token). Después di «Oye Siri, añadir tarea».
      </p>
      <dl>
        <dt>URL</dt>
        <dd>
          <code>{endpoint}</code>
        </dd>
        {token && (
          <>
            <dt>Token (solo se muestra ahora)</dt>
            <dd>
              <code>{token}</code>
              <button className="link-btn" onClick={() => navigator.clipboard.writeText(token)}>
                Copiar
              </button>
            </dd>
          </>
        )}
      </dl>
      {error && <p className="form-msg">{error}</p>}
      <button className="btn" onClick={generate}>
        {token ? 'Generar otro token' : 'Generar token'}
      </button>
    </div>
  )
}

export function Account({ onClose }: { onClose: () => void }) {
  const { mode, session } = useStore()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Cuenta" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Cuenta</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        {mode === 'local' ? (
          <p>
            Estás en <b>modo local</b>: las tareas se guardan solo en este dispositivo. Para sincronizar móvil, PC y
            extensión, y usar Siri, configura Supabase en <code>app/.env.local</code> (ver README).
          </p>
        ) : session ? (
          <>
            <p>
              Sesión iniciada como <b>{session.user.email}</b>. Tus tareas se sincronizan entre dispositivos.
            </p>
            <SiriSetup />
            <button className="btn" onClick={() => supabase?.auth.signOut()}>
              Cerrar sesión
            </button>
          </>
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  )
}
