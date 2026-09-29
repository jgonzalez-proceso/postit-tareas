const COLORS = { yellow: '#ffe680', pink: '#ffc2d4', green: '#c4ecb8', blue: '#bfe0ff', orange: '#ffd0a1' }
const $ = (id) => document.getElementById(id)

async function send(message) {
  const res = await chrome.runtime.sendMessage(message)
  $('error').hidden = res?.ok !== false
  if (res?.ok === false) {
    $('error').textContent = res.error
    throw new Error(res.error)
  }
  return res?.data
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const empty = (text) => el('li', { className: 'empty', textContent: text })

// ---------- pestañas del popup ----------

const loaders = { notes: loadNotes, tasks: loadTasks, account: loadAccount }

for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.tabs button')) other.classList.toggle('on', other === tab)
    for (const section of document.querySelectorAll('section')) section.hidden = section.id !== tab.dataset.tab
    loaders[tab.dataset.tab]()
  })
}

// ---------- post-its ----------

async function loadNotes() {
  const notes = await send({ type: 'notes:all' })
  // Primero los de pestañas abiertas ahora mismo, para saltar entre sesiones.
  notes.sort((a, b) => Number(b.open) - Number(a.open) || b.updated_at.localeCompare(a.updated_at))
  $('notes-list').replaceChildren(
    ...(notes.length
      ? notes.map((note) => {
          const where = (note.open ? '● ' : '') + (note.page_title || note.url_key)
          const item = el(
            'button',
            { className: 'note-item', title: note.open ? 'Ir a la pestaña' : 'Abrir la página' },
            el('span', { className: 'where', textContent: where }),
            el('span', { className: 'text', textContent: note.text || '(vacío)' }),
          )
          item.style.background = COLORS[note.color] ?? COLORS.yellow
          item.addEventListener('click', async () => {
            await send({ type: 'notes:goto', note })
            window.close()
          })
          return el('li', {}, item)
        })
      : [empty('Aún no hay post-its pegados a ninguna pestaña.')]),
  )
}

$('new-note').addEventListener('click', async () => {
  await send({ type: 'notes:newHere' })
  window.close()
})

// ---------- tareas de hoy ----------

async function loadTasks() {
  const tasks = await send({ type: 'tasks:today' })
  tasks.sort((a, b) => Number(a.done) - Number(b.done) || a.created_at.localeCompare(b.created_at))
  $('tasks-list').replaceChildren(
    ...(tasks.length
      ? tasks.map((task) => {
          const box = el('input', { type: 'checkbox', checked: task.done })
          const item = el(
            'li',
            { className: 'task-item' + (task.done ? ' done' : '') },
            el('label', {}, box, el('span', { textContent: task.title })),
          )
          box.addEventListener('change', async () => {
            await send({ type: 'tasks:toggle', id: task.id, done: box.checked })
            loadTasks()
          })
          return item
        })
      : [empty('Nada pendiente para hoy.')]),
  )
}

$('task-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const title = $('task-input').value.trim()
  if (!title) return
  $('task-input').value = ''
  await send({ type: 'tasks:add', title })
  loadTasks()
})

// ---------- cuenta ----------

async function loadAccount() {
  const { configured, email } = await send({ type: 'auth:status' })
  const box = $('account')

  if (!configured) {
    box.replaceChildren(
      el('p', { textContent: 'Modo local: los post-its se guardan solo en este Chrome.' }),
      el('p', { className: 'hint', textContent: 'Para sincronizar con la app, rellena extension/config.js y recarga la extensión.' }),
    )
    return
  }

  if (email) {
    const out = el('button', { className: 'btn', textContent: 'Cerrar sesión' })
    out.addEventListener('click', async () => {
      await send({ type: 'auth:logout' })
      loadAccount()
    })
    box.replaceChildren(el('p', { textContent: `Sincronizando como ${email}.` }), out)
    return
  }

  const mail = el('input', { type: 'email', placeholder: 'Email', required: true, autocomplete: 'email' })
  const pass = el('input', { type: 'password', placeholder: 'Contraseña', required: true, autocomplete: 'current-password' })
  const form = el('form', {}, mail, pass, el('button', { className: 'btn primary', textContent: 'Entrar' }))
  form.style.cssText = 'display:grid;gap:8px'
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    await send({ type: 'auth:login', email: mail.value, password: pass.value })
    loadAccount()
  })
  box.replaceChildren(
    el('p', { className: 'hint', textContent: 'Entra con la misma cuenta de la app. Sin sesión, los post-its se quedan solo en este Chrome.' }),
    form,
  )
}

loadNotes()
