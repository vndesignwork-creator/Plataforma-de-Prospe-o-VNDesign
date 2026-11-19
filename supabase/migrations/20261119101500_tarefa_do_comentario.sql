-- Comentário na imagem → tarefa: cada marca pode ter uma tarefa do projeto
-- ligada. Concluir a tarefa resolve a marca; resolver a marca fecha a tarefa.
alter table public.deliverable_pins
  add column if not exists task_id uuid references public.lead_tasks(id) on delete set null;
create index if not exists deliverable_pins_task_idx on public.deliverable_pins (task_id);
