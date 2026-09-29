-- Postit Tareas: instalación completa. Se puede ejecutar más de una vez.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  priority text check (priority in ('low', 'medium', 'high')),
  scope text not null default 'day' check (scope in ('day', 'week', 'later')),
  date date,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null default '' check (char_length(text) <= 5000),
  color text not null default 'yellow' check (color in ('yellow', 'pink', 'green', 'blue', 'orange')),
  url text,
  url_key text,
  match text not null default 'page' check (match in ('page', 'site')),
  page_title text,
  x integer not null default 40,
  y integer not null default 120,
  w integer not null default 240,
  h integer not null default 200,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, date);
create index if not exists notes_user_key_idx on public.notes (user_id, url_key);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.api_tokens enable row level security;

drop policy if exists "tasks: propias" on public.tasks;
create policy "tasks: propias" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes: propias" on public.notes;
create policy "notes: propias" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "api_tokens: ver propios" on public.api_tokens;
create policy "api_tokens: ver propios" on public.api_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "api_tokens: crear propios" on public.api_tokens;
create policy "api_tokens: crear propios" on public.api_tokens
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "api_tokens: borrar propios" on public.api_tokens;
create policy "api_tokens: borrar propios" on public.api_tokens
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tasks, public.notes to authenticated;
grant select, insert, delete on public.api_tokens to authenticated;
grant all on public.tasks, public.notes, public.api_tokens to service_role;

-- Sincronización en tiempo real entre dispositivos
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
