-- Tarefas em cartões (como as listas do Google Keep): uma lista tem um título e
-- várias tarefas. As tarefas dos leads e projetos aparecem num cartão por lead;
-- as soltas podem pertencer a uma lista (list_id). Apagar a lista apaga as tarefas dela.
create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_lists_ws_idx on public.task_lists (workspace_id, position);
create trigger task_lists_touch before update on public.task_lists
  for each row execute function public.vnd_touch_updated_at();
alter table public.task_lists enable row level security;
create policy task_lists_member_all on public.task_lists for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

alter table public.lead_tasks add column if not exists list_id uuid references public.task_lists(id) on delete cascade;
create index if not exists lead_tasks_list_idx on public.lead_tasks (list_id, position) where list_id is not null;
-- Uma tarefa ou é de um lead ou de uma lista (nunca das duas).
alter table public.lead_tasks add constraint lead_tasks_lead_or_list check (lead_id is null or list_id is null);

-- O texto das tarefas passa de 300 para 2000 caracteres.
alter table public.lead_tasks drop constraint if exists lead_tasks_title_check;
alter table public.lead_tasks add constraint lead_tasks_title_check check (length(btrim(title)) between 1 and 2000);
