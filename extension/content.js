// Dibuja sobre la página los post-its vinculados a su URL.
// Todo vive dentro de un shadow DOM para no mezclarse con los estilos del sitio.
(() => {
  // Al recargar la extensión, la copia anterior de este script se queda huérfana
  // en las pestañas abiertas. La nueva la retira y ocupa su lugar.
  const REPLACE = 'postit-tareas:replace'
  window.dispatchEvent(new Event(REPLACE))
  document.getElementById('postit-tareas')?.remove()
  let alive = true
  window.addEventListener(
    REPLACE,
    () => {
      alive = false
      for (const { timer } of timers.values()) clearTimeout(timer)
    },
    { once: true },
  )

  const COLORS = { yellow: '#ffe680', pink: '#ffc2d4', green: '#c4ecb8', blue: '#bfe0ff', orange: '#ffd0a1' }
  const COLOR_NAMES = Object.keys(COLORS)

  const CSS = `
    :host { all: initial; }
    .note {
      position: fixed; z-index: 2147483646; display: flex; flex-direction: column;
      min-width: 160px; min-height: 40px; max-width: 90vw; max-height: 90vh;
      border-radius: 4px 4px 18px 4px; box-shadow: 0 8px 22px rgba(0,0,0,.28);
      color: #24221c; font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
      resize: both; overflow: hidden;
    }
    .note.collapsed { resize: none; height: auto !important; }
    .note.collapsed textarea { display: none; }
    .bar {
      display: flex; align-items: center; gap: 2px; padding: 3px 4px 3px 8px; flex: none;
      background: rgba(0,0,0,.08); cursor: grab; user-select: none; touch-action: none;
    }
    .bar:active { cursor: grabbing; }
    .title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; opacity: .75; }
    button {
      all: unset; box-sizing: border-box; min-width: 24px; height: 24px; padding: 0 5px; border-radius: 5px;
      text-align: center; font: 600 12px/24px system-ui, sans-serif; color: #24221c; cursor: pointer;
    }
    button:hover { background: rgba(0,0,0,.12); }
    button:focus-visible { outline: 2px solid #1d6fd8; }
    button.danger { background: #c62828; color: #fff; }
    .dot { width: 14px; min-width: 14px; height: 14px; padding: 0; border-radius: 50%; border: 1px solid rgba(0,0,0,.35); }
    textarea {
      all: unset; box-sizing: border-box; flex: 1; width: 100%; padding: 8px 10px 14px;
      font: inherit; color: inherit; white-space: pre-wrap; overflow-wrap: anywhere; overflow: auto; cursor: text;
    }
    textarea::placeholder { color: rgba(0,0,0,.45); }
  `

  let root = null
  const elements = new Map() // id -> elemento
  const timers = new Map()

  async function send(message) {
    try {
      const res = await chrome.runtime.sendMessage(message)
      return res?.ok ? res.data : null
    } catch {
      return null // la extensión se recargó; la página necesita refrescarse
    }
  }

  function ensureRoot() {
    if (root?.host.isConnected) return root
    const host = document.createElement('div')
    host.id = 'postit-tareas'
    root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = CSS
    root.append(style)
    document.documentElement.append(host)
    elements.clear()
    return root
  }

  // Guarda con un pequeño retardo para no escribir en cada tecla o píxel.
  function save(note, patch, delay = 500) {
    Object.assign(note, patch)
    const pending = { ...(timers.get(note.id)?.patch ?? {}), ...patch }
    clearTimeout(timers.get(note.id)?.timer)
    const timer = setTimeout(() => {
      timers.delete(note.id)
      send({ type: 'notes:update', id: note.id, patch: pending, url: location.href })
    }, delay)
    timers.set(note.id, { timer, patch: pending })
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(v, Math.max(min, max)))

  function place(el, note) {
    el.style.left = clamp(note.x, 0, innerWidth - 80) + 'px'
    el.style.top = clamp(note.y, 0, innerHeight - 40) + 'px'
  }

  function button(label, title, onClick, className = '') {
    const b = document.createElement('button')
    b.textContent = label
    b.title = title
    b.setAttribute('aria-label', title)
    b.className = className
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', onClick)
    return b
  }

  function build(note) {
    const el = document.createElement('div')
    el.className = 'note' + (note.collapsed ? ' collapsed' : '')
    el.style.background = COLORS[note.color] ?? COLORS.yellow
    el.style.width = note.w + 'px'
    el.style.height = note.h + 'px'
    place(el, note)

    const bar = document.createElement('div')
    bar.className = 'bar'
    const title = document.createElement('span')
    title.className = 'title'
    const setTitle = () => (title.textContent = note.collapsed ? note.text.split('\n')[0] || 'Post-it' : '')
    setTitle()

    const color = button('', 'Cambiar color', () => {
      const next = COLOR_NAMES[(COLOR_NAMES.indexOf(note.color) + 1) % COLOR_NAMES.length]
      el.style.background = color.style.background = COLORS[next]
      save(note, { color: next }, 0)
    }, 'dot')
    color.style.background = 'rgba(255,255,255,.6)'

    const scope = button(note.match === 'site' ? 'Sitio' : 'Página', '', () => {
      const match = note.match === 'page' ? 'site' : 'page'
      save(note, { match }, 0)
      labelScope()
    })
    const labelScope = () => {
      scope.textContent = note.match === 'site' ? 'Sitio' : 'Página'
      scope.title = note.match === 'site' ? 'Visible en todo el sitio' : 'Visible solo en esta página'
      scope.setAttribute('aria-label', scope.title)
    }
    labelScope()

    const fold = button(note.collapsed ? '▸' : '▾', 'Plegar o desplegar', () => {
      save(note, { collapsed: !note.collapsed }, 0)
      el.classList.toggle('collapsed', note.collapsed)
      fold.textContent = note.collapsed ? '▸' : '▾'
      setTitle()
    })

    let armed = null
    const remove = button('✕', 'Borrar post-it', () => {
      if (!armed) {
        remove.textContent = '¿Borrar?'
        remove.classList.add('danger')
        armed = setTimeout(() => {
          armed = null
          remove.textContent = '✕'
          remove.classList.remove('danger')
        }, 3000)
        return
      }
      clearTimeout(armed)
      clearTimeout(timers.get(note.id)?.timer)
      timers.delete(note.id)
      el.remove()
      elements.delete(note.id)
      send({ type: 'notes:delete', id: note.id })
    })

    bar.append(color, title, scope, fold, remove)

    const area = document.createElement('textarea')
    area.value = note.text
    area.placeholder = 'Escribe aquí…'
    area.setAttribute('aria-label', 'Texto del post-it')
    area.addEventListener('input', () => save(note, { text: area.value }))
    // Evita que los atajos de teclado de la página se disparen al escribir.
    for (const type of ['keydown', 'keyup', 'keypress']) area.addEventListener(type, (e) => e.stopPropagation())

    // Arrastrar
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      const rect = el.getBoundingClientRect()
      const dx = e.clientX - rect.left
      const dy = e.clientY - rect.top
      bar.setPointerCapture(e.pointerId)
      const move = (ev) => {
        note.x = clamp(ev.clientX - dx, 0, innerWidth - 80)
        note.y = clamp(ev.clientY - dy, 0, innerHeight - 40)
        el.style.left = note.x + 'px'
        el.style.top = note.y + 'px'
      }
      const up = () => {
        bar.removeEventListener('pointermove', move)
        bar.removeEventListener('pointerup', up)
        bar.removeEventListener('pointercancel', up)
        save(note, { x: Math.round(note.x), y: Math.round(note.y) }, 0)
      }
      bar.addEventListener('pointermove', move)
      bar.addEventListener('pointerup', up)
      bar.addEventListener('pointercancel', up)
    })

    // Redimensionar (tirador nativo de la esquina)
    new ResizeObserver(() => {
      if (note.collapsed || !el.isConnected) return
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      if (w && h && (w !== note.w || h !== note.h)) save(note, { w, h })
    }).observe(el)

    el.append(bar, area)
    return el
  }

  async function load() {
    if (!alive) return
    const notes = (await send({ type: 'notes:forUrl', url: location.href })) ?? []
    if (!notes.length && !elements.size) return
    const parent = ensureRoot()
    const ids = new Set(notes.map((n) => n.id))
    for (const [id, el] of elements) {
      if (!ids.has(id)) {
        el.remove()
        elements.delete(id)
      }
    }
    for (const note of notes) {
      if (elements.has(note.id)) continue // no pisar lo que se está editando
      const el = build(note)
      elements.set(note.id, el)
      parent.append(el)
    }
  }

  async function create() {
    if (!alive) return
    const offset = elements.size * 24
    const note = await send({
      type: 'notes:create',
      note: {
        url: location.href,
        page_title: document.title.slice(0, 200),
        x: Math.round(clamp(innerWidth - 300 - offset, 0, innerWidth - 80)),
        y: 80 + offset,
      },
    })
    if (!note) return
    const el = build(note)
    elements.set(note.id, el)
    ensureRoot().append(el)
    el.querySelector('textarea').focus()
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === 'notes:refresh') load()
    if (message.type === 'notes:create') create()
    respond(true)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load()
  })
  addEventListener('resize', () => {
    for (const el of elements.values()) {
      el.style.left = clamp(parseFloat(el.style.left), 0, innerWidth - 80) + 'px'
      el.style.top = clamp(parseFloat(el.style.top), 0, innerHeight - 40) + 'px'
    }
  })

  load()
})()
