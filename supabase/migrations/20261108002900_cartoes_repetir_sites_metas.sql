-- =============================================================================
-- Tarefas: cartões partilhados e arquivados, quem marcou, tarefas que se repetem.
-- Sites dos clientes: vigiar se estão no ar, o certificado SSL e o domínio.
-- Metas do mês: progresso (emails, chamadas, WhatsApp, propostas, clientes, recebido).
-- (A cor e o "afixar" dos cartões são de cada pessoa: ficam nas preferências.)
-- =============================================================================

-- Cartões (listas) ------------------------------------------------------------
-- Partilhada: toda a equipa vê e mexe; senão, só quem a criou.
alter table public.task_lists add column if not exists shared boolean not null default false;
-- Arquivada: sai do quadro (as tarefas dela também), volta com "Desarquivar".
alter table public.task_lists add column if not exists archived_at timestamptz;

-- Tarefas -----------------------------------------------------------------------
-- Quem a marcou como feita.
alter table public.lead_tasks add column if not exists done_by uuid references auth.users(id) on delete set null;
-- Repetir: ao concluir, cria-se a seguinte (com a data seguinte).
alter table public.lead_tasks add column if not exists repeat text
  check (repeat is null or repeat in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly'));
-- A tarefa seguinte já criada (concluir outra vez não cria outra).
alter table public.lead_tasks add column if not exists next_task_id uuid references public.lead_tasks(id) on delete set null;

-- Sites dos clientes ------------------------------------------------------------
create table public.site_monitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  url text not null check (length(btrim(url)) between 4 and 500),
  active boolean not null default true,
  -- Última verificação
  checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  is_up boolean,
  status_code integer,
  response_ms integer,
  error text check (error is null or length(error) <= 500),
  -- Falhas seguidas (2 = em baixo: uma falha só pode ser um soluço).
  fail_count integer not null default 0,
  down_since timestamptz,
  ssl_expires_at timestamptz,
  ssl_error text check (ssl_error is null or length(ssl_error) <= 300),
  -- Domínio: pela consulta pública (RDAP) ou escrito à mão.
  domain_expires_on date,
  domain_source text check (domain_source is null or domain_source in ('rdap', 'manual')),
  domain_checked_at timestamptz,
  -- Avisos já dados (não repete): {"down": "<down_since>", "ssl": "<data>", "domain": "<data>"}
  alerted jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade,
  unique (lead_id)
);
create index site_monitors_due_idx on public.site_monitors (active, next_check_at);
create index site_monitors_ws_idx on public.site_monitors (workspace_id);
create trigger site_monitors_touch before update on public.site_monitors
  for each row execute function public.vnd_touch_updated_at();
alter table public.site_monitors enable row level security;
create policy site_monitors_member_all on public.site_monitors for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Metas do mês --------------------------------------------------------------------
-- Os números de um período para as metas (as metas ficam nas definições do workspace).
-- Emails: cada email enviado. Chamadas e WhatsApp: leads contactados por dia nesse canal
-- (registar a chamada e depois "Contactado" na prospeção conta uma vez).
-- p_user: só o que essa pessoa fez (emails, chamadas, WhatsApp); null = a equipa toda.
create or replace function public.goal_progress(p_workspace_id uuid, p_from date, p_to date, p_user uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'Europe/Lisbon') as t0,
           ((p_to + 1)::timestamp at time zone 'Europe/Lisbon') as t1
  ),
  acts as (
    select a.lead_id, a.type, a.payload, (a.created_at at time zone 'Europe/Lisbon')::date as day
      from public.lead_activities a cross join bounds b
     where a.workspace_id = p_workspace_id
       and a.created_at >= b.t0 and a.created_at < b.t1
       and (p_user is null or a.actor_user_id = p_user)
       and a.type in ('email_sent', 'call_logged', 'template_used', 'note')
  ),
  calls as (
    select distinct lead_id, day from acts
     where type = 'call_logged'
        or (type = 'note' and payload ->> 'via' = 'prospecting' and payload ->> 'channel' = 'phone')
  ),
  whatsapp as (
    select distinct lead_id, day from acts
     where (type = 'template_used' and (payload ->> 'via' = 'whatsapp' or payload ->> 'channel' = 'whatsapp'))
        or (type = 'note' and payload ->> 'via' = 'prospecting' and payload ->> 'channel' = 'whatsapp')
  ),
  period as (select public.stats_period(p_workspace_id, p_from, p_to) as s)
  select jsonb_build_object(
    'emails', (select count(*) from acts where type = 'email_sent'),
    'calls', (select count(*) from calls),
    'whatsapp', (select count(*) from whatsapp),
    'proposals', (select (s ->> 'proposals')::int from period),
    'clients', (select (s ->> 'won')::int from period),
    'revenue', (select (s ->> 'received')::numeric from period)
  )
$$;
grant execute on function public.goal_progress(uuid, date, date, uuid) to authenticated;
