# Postit Tareas

Lista de tareas diaria y semanal con dictado por voz, más post-its pegados a pestañas de Chrome.

| Carpeta | Qué es |
| --- | --- |
| `app/` | Web app instalable (PWA) — React + Vite |
| `extension/` | Extensión de Chrome que dibuja los post-its sobre cada pestaña |
| `supabase/` | Esquema de base de datos y función `add-task` para Siri |

## Probar en local (sin cuenta ni servidor)

```bash
cd app
npm install
npm run dev
```

Abre http://localhost:5183. Sin configurar Supabase la app guarda todo en el navegador (modo local).

Extensión: en `chrome://extensions` activa **Modo de desarrollador** → **Cargar descomprimida** → carpeta `extension/`.
Nuevo post-it: `Alt+Shift+P`, botón derecho → «Nuevo post-it en esta página», o desde el icono de la extensión.

## Activar sincronización y Siri

1. Crea un proyecto en [supabase.com](https://supabase.com/dashboard) (región UE).
2. En **SQL Editor**, ejecuta `supabase/migrations/001_init.sql`.
3. Despliega la función (usa autenticación propia por token, por eso va sin verificación de JWT):
   ```bash
   npx supabase functions deploy add-task --no-verify-jwt --project-ref TU_REF
   ```
4. Copia `app/.env.example` a `app/.env.local` y rellena URL y clave *publishable* (Project Settings → API).
5. Pon los mismos dos valores en `extension/config.js` y recarga la extensión.
6. Publica `app/` en un hosting con HTTPS (Vercel, Netlify…) para usarla desde el móvil
   e instalarla con «Añadir a pantalla de inicio».
7. En la app: **Cuenta → Generar token** y sigue las instrucciones para crear el atajo de Siri.

## Frases que entiende (voz, texto y Siri)

- Fecha: `hoy`, `mañana`, `pasado mañana`, `el viernes`, `esta semana`, `la semana que viene`, `más adelante`
- Prioridad (opcional): `prioridad alta / media / baja`, `urgente`

Ejemplo: «llamar a Ana mañana prioridad alta».

El intérprete está en `app/src/lib/parse.ts`; `supabase/functions/add-task/parse.ts` es una copia exacta
(si cambias uno, copia el archivo al otro sitio). Prueba: `node app/scripts/parse.test.mjs`.

## Límites conocidos

- Los post-its se anclan a la **URL** de la pestaña (página concreta o todo el sitio), no a la pestaña en sí.
- No aparecen en páginas internas de Chrome (`chrome://`, Web Store) ni en PDFs.
- Sin conexión la app muestra lo último sincronizado, pero los cambios hechos sin conexión no se guardan en la nube.
- El dictado dentro de la app depende del navegador; en iPhone, si no aparece el micrófono, usa el del teclado o Siri.
