# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal to-do app (daily / weekly / later) with voice entry, plus Chrome sticky notes ("post-its") anchored to tab URLs, plus a Siri endpoint. Three deployables share one Supabase backend:

- `app/` — Vite + React 19 + TypeScript PWA. Deployed on Vercel (root directory `app`) on every push to `main`; live at https://postit-tareas-javi.vercel.app.
- `extension/` — Chrome MV3 extension, plain JS, no build step. Loaded unpacked from this folder.
- `supabase/` — SQL schema and the `add-task` edge function.

UI text, comments and commit messages are in Spanish.

## Commands

All app commands run from `app/`:

```bash
npm install
npm run dev          # http://localhost:5183 (port fixed in vite.config.ts)
npm run build        # tsc --noEmit && vite build — use this as the type check
node scripts/parse.test.mjs   # parser tests (assert-based, no test runner)
npm run icons        # regenerates PNG icons for app/public and extension/icons from public/icon.svg
```

To run the app in **local mode** (no Supabase, no login, data in localStorage) despite `.env.local` being present:

```bash
VITE_SUPABASE_URL= VITE_SUPABASE_KEY= npx vite --port 5184
```

This is the only way to exercise the UI here: there is no test account, and login must be done by the user.

Extension: `node --check extension/*.js` is the only automated check. After changing extension files the user must reload it in `chrome://extensions`.

Edge function: `npx supabase functions deploy add-task --no-verify-jwt --project-ref mmvhmokqijungwuhlmio` (after `npx supabase login`). `--no-verify-jwt` is required: the function does its own auth via personal tokens.

## Backend / accounts (important constraints)

- Supabase project `Todolist`, ref `mmvhmokqijungwuhlmio`, lives in the user's `j.gonzalez@procesoclaro.com` account. The Supabase MCP connector in Claude sessions is bound to a **different** account and has no access — do not try to apply migrations through it. Give the user SQL to paste into the dashboard SQL Editor instead.
- The publishable key in `app/.env.local` and `extension/config.js` is public by design. Never commit or ask for the `sb_secret_` key.
- Realtime is enabled for `tasks` and `notes` (`supabase_realtime` publication).
- Schema changes: add a numbered file in `supabase/migrations/` **and** keep `supabase/setup.sql` in sync (it is the idempotent "install everything" script users actually run). Ship the SQL before pushing app code that depends on it: Vercel deploys on push.
- Sign-ups should stay disabled in Supabase Auth (single-user app).

## Architecture

### Data model (`app/src/lib/types.ts`, `supabase/setup.sql`)

- `tasks`: `scope` is `'day' | 'week' | 'later'`; `date` means the day for `day`, the **Monday** of the week for `week`, `null` for `later`. `priority` is optional. `position` (double, nullable) is the manual sort order; `positionOf()` falls back to `created_at` ms so pre-existing rows and rows inserted without it (Siri) sort naturally. Undone `day`/`week` tasks with a past date are "overdue" and are pulled into today / this week with an "Atrasada" badge (`isOverdue` in `TaskList.tsx`).
- `notes`: anchored by `url_key` = `origin+pathname` (`match='page'`) or `origin` (`match='site'`), computed client-side by `urlKey()` in the app and `keyOf()` in the extension; the two must stay equivalent. `x/y/w/h` are viewport pixels used by the content script.
- `api_tokens`: SHA-256 hashes of `pt_…` tokens for the Siri endpoint. Only one token named `Siri` is kept (generating a new one deletes the old).
- All tables are RLS-scoped to `auth.uid()`; `user_id` defaults to it so clients never send it.

### App state (`app/src/lib/store.ts`)

Single external store consumed via `useStore()` (`useSyncExternalStore`). Mode is decided at import time in `supabase.ts`: env vars present → `cloud`, else `local`. In cloud mode: session from Supabase auth, full fetch on login and on `visibilitychange`, realtime `postgres_changes` subscription merging by `updated_at`, and a per-user localStorage cache (`pt.<uid>.tasks`) for instant first paint. All mutations are optimistic: state is updated first, then pushed; a push error only sets `state.error`, which `App.tsx` surfaces as a toast. IDs are generated client-side (`crypto.randomUUID`) so inserts need no round trip.

### Natural-language parsing (`app/src/lib/parse.ts`)

`parseTask(text, now, fallback)` extracts priority ("prioridad alta", "urgente") and date/scope ("mañana", "el viernes", "esta semana", "más adelante") from Spanish text and strips them from the title. It is dependency-free on purpose: `supabase/functions/add-task/parse.ts` is a **verbatim copy** (Deno can't import from `app/`). When editing one, copy it over the other and rerun `node scripts/parse.test.mjs`. Beware `\b` with accented characters in the regexes; the existing patterns are written to avoid starting/ending on `ñ`/accents.

### Drag-and-drop ordering (`TaskList.tsx`)

Pointer events on the `.handle` button (with pointer capture and `touch-action: none` so it works on touch). While dragging, the list renders `sorted` with the item moved to the hovered index; on release only the moved task gets a new `position` (midpoint between neighbours, or ±1000 at the ends). If no gap remains, `reorderTasks()` renumbers the whole group. Reordering never crosses the done/undone boundary.

### Extension (`extension/`)

- `background.js` (module service worker) is the only piece that talks to storage/Supabase. It uses raw `fetch` against `/auth/v1` and `/rest/v1` (no supabase-js), keeps the session in `chrome.storage.local`, and falls back to local `chrome.storage` when not configured or not logged in. A refresh failure only logs out on a 4xx; network errors keep the session.
- `content.js` renders notes for the current URL inside a shadow DOM host `#postit-tareas`. It is injected into already-open tabs on install, and when re-injected (after an extension reload) it dispatches `postit-tareas:replace` so the orphaned previous instance stops acting. Saves are debounced per note and go through `notes:update` messages.
- `popup.js` lists all anchored notes (open tabs first) and today's tasks. "Go to note" focuses an existing tab matching `url_key`, else opens the URL.
- Message protocol: `{type, ...}` → `{ok, data}` / `{ok:false, error}`; handlers live in the `handlers` map in `background.js`.
- The `new-note` command's suggested shortcut (`Alt+Shift+P`) can be taken by another extension; the user reassigns it in `chrome://extensions/shortcuts`.

### Siri endpoint (`supabase/functions/add-task/index.ts`)

`POST` with `Authorization: Bearer pt_…`. Body `{text}` creates a task (parsed with `parseTask` in the `tz` timezone, default `Europe/Madrid`); `{action:"list"}` returns today's pending tasks. Responses are `{message}` in Spanish so an iOS Shortcut can read them aloud. Uses the service-role client, so it must keep validating the token hash itself.

## Gotchas

- `.claude/launch.json` at the repo root is unused by the browser preview tooling in this environment (npm path with spaces breaks it); start Vite from Bash and attach with a `url`-only launch config.
- Vercel bundle size roughly doubles when the Supabase env vars are set (client gets instantiated); this is expected, not a regression.
- The browser preview may fail to screenshot; verify UI via `get_page_text` / JS evaluation instead.
