-- Orden manual de las tareas (arrastrar y soltar)
alter table public.tasks add column if not exists position double precision;
notify pgrst, 'reload schema';
