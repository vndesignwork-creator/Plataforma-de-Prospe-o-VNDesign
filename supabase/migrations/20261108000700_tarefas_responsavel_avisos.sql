-- =============================================================================
-- Tarefas com responsável, avisos e comentários da equipa.
--  - lead_tasks.assigned_to: a quem foi dada a tarefa (membro do workspace).
--  - notifications: avisos de cada pessoa ("deram-te uma tarefa",
--    "mencionaram-te num comentário"). Só triggers os criam; cada um vê,
--    marca como lido e apaga só os seus.
--  - activity_type 'comment': comentário interno na linha do tempo, com
--    @menções (payload.mentions = ids dos membros mencionados).
-- =============================================================================

alter type public.activity_type add value if not exists 'comment';

-- Responsável pela tarefa.
alter table public.lead_tasks add column if not exists assigned_to uuid references auth.users (id) on delete set null;
create index if not exists lead_tasks_assigned_idx on public.lead_tasks (workspace_id, assigned_to) where done_at is null;

-- O responsável tem de ser da equipa (deste workspace).
create or replace function public.vnd_lead_tasks_check_assignee()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (
       select 1 from public.workspace_members m
        where m.workspace_id = new.workspace_id and m.user_id = new.assigned_to
     ) then
    -- Ao repor da reciclagem, quem entretanto saiu da equipa fica sem tarefa (em vez de falhar).
    if current_setting('vnd.skip_update_log', true) = '1' then
      new.assigned_to := null;
    else
      raise exception using errcode = '23514', message = 'Essa pessoa não faz parte da equipa.';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_lead_tasks_check_assignee() from public, anon, authenticated;
create trigger lead_tasks_check_assignee before insert or update of assigned_to on public.lead_tasks
  for each row execute function public.vnd_lead_tasks_check_assignee();

-- Avisos.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('task_assigned', 'mention')),
  lead_id uuid,
  task_id uuid references public.lead_tasks (id) on delete cascade,
  activity_id uuid references public.lead_activities (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  text text not null check (length(text) between 1 and 300),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index notifications_user_idx on public.notifications (workspace_id, user_id, created_at desc);
create index notifications_unread_idx on public.notifications (workspace_id, user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_own_select on public.notifications for select to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()))
  with check (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));

-- Deram uma tarefa a alguém (que não a própria pessoa): avisa-a.
create or replace function public.vnd_lead_tasks_notify_assignee()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and new.assigned_to is distinct from (select auth.uid())
     and new.done_at is null
     -- Repor da reciclagem não volta a avisar.
     and coalesce(current_setting('vnd.skip_update_log', true), '') <> '1' then
    insert into public.notifications (workspace_id, user_id, kind, lead_id, task_id, actor_user_id, text)
    values (new.workspace_id, new.assigned_to, 'task_assigned', new.lead_id, new.id, (select auth.uid()), left(new.title, 300));
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_lead_tasks_notify_assignee() from public, anon, authenticated;
create trigger lead_tasks_notify_assignee after insert or update of assigned_to on public.lead_tasks
  for each row execute function public.vnd_lead_tasks_notify_assignee();

-- Comentário com @menções: avisa cada pessoa mencionada (só membros, nunca quem escreveu).
create or replace function public.vnd_lead_activities_notify_mentions()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.type::text = 'comment' and jsonb_typeof(new.payload -> 'mentions') = 'array'
     and coalesce(current_setting('vnd.skip_update_log', true), '') <> '1' then
    insert into public.notifications (workspace_id, user_id, kind, lead_id, activity_id, actor_user_id, text)
    select new.workspace_id, m.user_id, 'mention', new.lead_id, new.id, new.actor_user_id,
           left(coalesce(nullif(btrim(new.body), ''), 'Comentário'), 300)
      from public.workspace_members m
     where m.workspace_id = new.workspace_id
       and m.user_id::text in (select jsonb_array_elements_text(new.payload -> 'mentions'))
       and m.user_id is distinct from new.actor_user_id;
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_lead_activities_notify_mentions() from public, anon, authenticated;
create trigger lead_activities_notify_mentions after insert on public.lead_activities
  for each row execute function public.vnd_lead_activities_notify_mentions();

-- Os comentários também se apagam (só os do próprio autor).
drop policy if exists lead_activities_delete_own_manual on public.lead_activities;
create policy lead_activities_delete_own_manual on public.lead_activities for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and type::text in ('note', 'call_logged', 'email_sent', 'comment')
    and actor_user_id = (select auth.uid())
  );

-- Anonimizar um lead apaga os avisos dele (o texto pode ter dados pessoais).
create or replace function public.vnd_leads_clear_notifications()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.anonymized_at is not null and old.anonymized_at is null then
    delete from public.notifications where lead_id = new.id;
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_leads_clear_notifications() from public, anon, authenticated;
create trigger leads_clear_notifications after update of anonymized_at on public.leads
  for each row execute function public.vnd_leads_clear_notifications();
