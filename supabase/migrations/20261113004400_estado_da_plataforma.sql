-- =============================================================================
-- Estado da plataforma
-- 1) Quando correram pela última vez as tarefas automáticas (cron do hPanel): os
--    lembretes (de 5 em 5 minutos) e o resumo diário. Se pararem, a plataforma avisa.
-- 2) Problemas em segundo plano (um email que não saiu, uma caixa de email que não liga,
--    um erro inesperado), com quantas vezes aconteceram, para mostrar em
--    Definições → Estado da plataforma e avisar no sino.
-- =============================================================================

-- 1) ---------------------------------------------------------------------------
create table if not exists public.platform_status (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  reminders_at timestamptz,
  digest_at timestamptz,
  -- Último aviso de "as tarefas automáticas pararam" (um por paragem).
  stale_alerted_at timestamptz
);
alter table public.platform_status enable row level security;
drop policy if exists platform_status_member_select on public.platform_status;
create policy platform_status_member_select on public.platform_status for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- O cron chama no fim de cada corrida (p_job: 'reminders' ou 'digest').
create or replace function public.vnd_cron_heartbeat(p_job text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job = 'reminders' then
    insert into public.platform_status (workspace_id, reminders_at)
    select w.id, now() from public.workspaces w
    on conflict (workspace_id) do update set reminders_at = excluded.reminders_at;
  elsif p_job = 'digest' then
    insert into public.platform_status (workspace_id, digest_at)
    select w.id, now() from public.workspaces w
    on conflict (workspace_id) do update set digest_at = excluded.digest_at;
  end if;
end;
$$;
revoke all on function public.vnd_cron_heartbeat(text) from public, anon, authenticated;
grant execute on function public.vnd_cron_heartbeat(text) to service_role;

-- 2) ---------------------------------------------------------------------------
create table if not exists public.platform_problems (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- De que parte: 'email', 'mailbox', 'digest', 'backup', 'lead_generation', 'error'…
  area text not null check (char_length(area) between 1 and 40),
  -- O mesmo problema repetido junta-se (ex.: o id da caixa de email).
  key text not null check (char_length(key) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  detail text check (detail is null or char_length(detail) <= 1000),
  count integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists platform_problems_open_key on public.platform_problems (workspace_id, area, key) where resolved_at is null;
create index if not exists platform_problems_recent on public.platform_problems (workspace_id, last_at desc);
alter table public.platform_problems enable row level security;
drop policy if exists platform_problems_member_select on public.platform_problems;
create policy platform_problems_member_select on public.platform_problems for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists platform_problems_member_update on public.platform_problems;
create policy platform_problems_member_update on public.platform_problems for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Regista (ou soma +1 ao problema igual ainda por resolver). Devolve true se é novo.
create or replace function public.vnd_report_problem(p_workspace_id uuid, p_area text, p_key text, p_title text, p_detail text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  insert into public.platform_problems (workspace_id, area, key, title, detail)
  values (p_workspace_id, left(p_area, 40), left(p_key, 200), left(p_title, 200), left(p_detail, 1000))
  on conflict (workspace_id, area, key) where resolved_at is null
  do update set count = public.platform_problems.count + 1, last_at = now(), title = excluded.title, detail = excluded.detail
  returning (xmax = 0) into v_new;
  -- Os resolvidos com mais de 90 dias saem.
  if random() < 0.05 then
    delete from public.platform_problems where workspace_id = p_workspace_id and resolved_at < now() - interval '90 days';
  end if;
  return v_new;
end;
$$;
revoke all on function public.vnd_report_problem(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.vnd_report_problem(uuid, text, text, text, text) to service_role;
