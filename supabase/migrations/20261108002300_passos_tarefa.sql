-- Passos dentro de uma tarefa: uma pequena lista ([{id, text, done}], até 30).
alter table public.lead_tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb
  check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30);
