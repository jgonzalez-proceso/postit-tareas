import { SUPABASE_KEY, SUPABASE_URL } from './config.js'

const BASE = SUPABASE_URL.replace(/\/$/, '')
const configured = Boolean(BASE && SUPABASE_KEY)

// ---------- utilidades ----------

const pad = (n) => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function keysFor(url) {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    return { page: u.origin + u.pathname, site: u.origin }
  } catch {
    return null
  }
}

const keyOf = (url, match) => keysFor(url)?.[match] ?? null

// ---------- sesión ----------

async function authRequest(grant, body) {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error_description || data.msg || 'No se pudo iniciar sesión')
    error.status = res.status
    throw error
  }
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    email: data.user?.email,
  }
  await chrome.storage.local.set({ session })
  return session
}

async function getSession() {
  if (!configured) return null
  const { session } = await chrome.storage.local.get('session')
  if (!session) return null
  if (session.expires_at - 60 > Date.now() / 1000) return session
  try {
    return await authRequest('refresh_token', { refresh_token: session.refresh_token })
  } catch (error) {
    // Solo se cierra la sesión si el servidor la rechaza de verdad. Un fallo de
    // red o un error temporal no deben obligar a entrar de nuevo.
    if (error.status >= 400 && error.status < 500) {
      await chrome.storage.local.remove('session')
      return null
    }
    return session
  }
}

async function rest(session, path, options = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Error ${res.status}`)
  return res.status === 204 ? null : res.json()
}

// ---------- datos (nube si hay sesión, local si no) ----------

async function localGet(name) {
  return (await chrome.storage.local.get(name))[name] ?? []
}

const store = {
  async list(table) {
    const s = await getSession()
    if (s) return rest(s, `${table}?select=*&order=created_at`)
    return localGet(table)
  },

  async notesFor(url) {
    const keys = keysFor(url)
    if (!keys) return []
    const s = await getSession()
    if (s) {
      const list = [keys.page, keys.site].map((k) => `"${k.replaceAll('"', '')}"`).join(',')
      return rest(s, `notes?select=*&url_key=in.(${encodeURIComponent(list)})&order=created_at`)
    }
    return (await localGet('notes')).filter((n) => n.url_key === keyOf(url, n.match))
  },

  async todayTasks() {
    const s = await getSession()
    const day = today()
    if (s) return rest(s, `tasks?select=*&scope=eq.day&or=(date.eq.${day},and(date.lt.${day},done.eq.false))&order=created_at`)
    return (await localGet('tasks')).filter((t) => t.scope === 'day' && (t.date === day || (t.date < day && !t.done)))
  },

  async insert(table, row) {
    const now = new Date().toISOString()
    const full = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...row }
    const s = await getSession()
    if (s) return (await rest(s, table, { method: 'POST', body: JSON.stringify(full) }))[0]
    await chrome.storage.local.set({ [table]: [...(await localGet(table)), full] })
    return full
  },

  async update(table, id, patch) {
    const full = { ...patch, updated_at: new Date().toISOString() }
    const s = await getSession()
    if (s) return (await rest(s, `${table}?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(full) }))[0]
    const list = (await localGet(table)).map((r) => (r.id === id ? { ...r, ...full } : r))
    await chrome.storage.local.set({ [table]: list })
    return list.find((r) => r.id === id)
  },

  async remove(table, id) {
    const s = await getSession()
    if (s) return rest(s, `${table}?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    await chrome.storage.local.set({ [table]: (await localGet(table)).filter((r) => r.id !== id) })
  },
}

// ---------- pestañas ----------

async function updateBadge(tab) {
  if (!tab?.id || !tab.url) return
  let count = 0
  try {
    count = (await store.notesFor(tab.url)).length
  } catch {
    // sin conexión: no se muestra contador
  }
  chrome.action.setBadgeBackgroundColor({ color: '#e0b400' })
  chrome.action.setBadgeText({ tabId: tab.id, text: count ? String(count) : '' })
}

async function tell(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch {
    // La pestaña se abrió antes de instalar la extensión: inyecta y reintenta.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
      return await chrome.tabs.sendMessage(tabId, message)
    } catch {
      return null // página protegida (chrome://, Web Store…)
    }
  }
}

async function newNoteIn(tab) {
  if (tab?.id && keysFor(tab.url)) await tell(tab.id, { type: 'notes:create' })
}

async function refreshAllTabs() {
  for (const tab of await chrome.tabs.query({})) {
    if (!keysFor(tab.url)) continue
    chrome.tabs.sendMessage(tab.id, { type: 'notes:refresh' }).catch(() => {})
    updateBadge(tab)
  }
}

async function goTo(note) {
  const tabs = await chrome.tabs.query({})
  const open = tabs.find((t) => keyOf(t.url, note.match) === note.url_key)
  if (open) {
    await chrome.tabs.update(open.id, { active: true })
    await chrome.windows.update(open.windowId, { focused: true })
  } else if (note.url) {
    await chrome.tabs.create({ url: note.url })
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'new-note',
    title: 'Nuevo post-it en esta página',
    contexts: ['page', 'selection'],
  })
  // Las pestañas ya abiertas no reciben el script solas: se les inyecta ahora.
  for (const tab of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {})
  }
})

chrome.contextMenus.onClicked.addListener((_info, tab) => newNoteIn(tab))

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'new-note') return
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  newNoteIn(tab)
})

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  // Navegación dentro de una SPA: la URL cambia sin recargar la página.
  if (change.url) chrome.tabs.sendMessage(tabId, { type: 'notes:refresh' }).catch(() => {})
  if (change.url || change.status === 'complete') updateBadge(tab)
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  updateBadge(await chrome.tabs.get(tabId).catch(() => null))
})

// ---------- mensajes ----------

const handlers = {
  'notes:forUrl': ({ url }) => store.notesFor(url),
  'notes:all': async () => {
    const [notes, tabs] = await Promise.all([store.list('notes'), chrome.tabs.query({})])
    return notes
      .filter((n) => n.url_key)
      .map((n) => ({ ...n, open: tabs.some((t) => keyOf(t.url, n.match) === n.url_key) }))
  },
  'notes:create': async ({ note }, sender) => {
    const match = note.match ?? 'page'
    const created = await store.insert('notes', {
      text: '',
      color: 'yellow',
      collapsed: false,
      w: 240,
      h: 200,
      ...note,
      match,
      url_key: keyOf(note.url, match),
    })
    updateBadge(sender.tab)
    return created
  },
  'notes:update': ({ id, patch, url }) => {
    if (patch.match) patch = { ...patch, url_key: keyOf(url, patch.match) }
    return store.update('notes', id, patch)
  },
  'notes:delete': async ({ id }, sender) => {
    await store.remove('notes', id)
    updateBadge(sender.tab)
  },
  'notes:newHere': async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    await newNoteIn(tab)
  },
  'notes:goto': ({ note }) => goTo(note),
  'tasks:today': () => store.todayTasks(),
  'tasks:add': ({ title }) =>
    store.insert('tasks', {
      title,
      priority: null,
      scope: 'day',
      date: today(),
      done: false,
      done_at: null,
      position: Date.now(),
    }),
  'tasks:toggle': ({ id, done }) =>
    store.update('tasks', id, { done, done_at: done ? new Date().toISOString() : null }),
  'auth:status': async () => ({ configured, email: (await getSession())?.email ?? null }),
  'auth:login': async ({ email, password }) => {
    const session = await authRequest('password', { email, password })
    refreshAllTabs()
    return { email: session.email }
  },
  'auth:logout': async () => {
    await chrome.storage.local.remove('session')
    refreshAllTabs()
  },
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const handler = handlers[message?.type]
  if (!handler) return false
  handler(message, sender)
    .then((data) => respond({ ok: true, data }))
    .catch((error) => respond({ ok: false, error: error.message }))
  return true
})
