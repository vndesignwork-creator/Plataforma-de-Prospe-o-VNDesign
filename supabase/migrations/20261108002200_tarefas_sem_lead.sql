-- Tarefas soltas: uma tarefa pode não pertencer a nenhum lead ou projeto
-- (ex.: "Renovar o seguro", "Atualizar o portefólio"). Aparecem em Tarefas e em
-- "Hoje"; as dos leads continuam a aparecer também na ficha.
alter table public.lead_tasks alter column lead_id drop not null;

-- Concluir uma tarefa solta não vai para a linha do tempo de nenhum lead.
create or replace function public.vnd_lead_tasks_log_done()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null and new.done_at is not null and old.done_at is null then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.lead_id, 'task_completed', jsonb_build_object('title', new.title),
            public.vnd_actor_user_id(), public.vnd_actor_token_id());
  end if;
  return new;
end
$$;

create index if not exists lead_tasks_personal_idx on public.lead_tasks (workspace_id, position) where lead_id is null;
