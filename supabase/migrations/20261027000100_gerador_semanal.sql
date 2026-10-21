-- =============================================================================
-- Gerador de leads automático (semanal)
--  - Pesquisas guardadas que correm sozinhas num dia e hora da semana (hora de
--    Lisboa), cada uma com o seu interruptor ativar/desativar.
--  - Quem as corre é o cron dos lembretes (de 5 em 5 minutos) e o do resumo
--    diário; next_run_at é calculado pelo servidor.
--  - Opcionalmente, as empresas novas entram logo como leads.
-- =============================================================================

create table public.lead_generation_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  enabled boolean not null default true,
  query text not null check (length(btrim(query)) between 3 and 500),
  city text check (city is null or length(btrim(city)) between 1 and 120),
  sector_id uuid,
  services text[] not null default '{}',
  max_results integer not null default 15 check (max_results between 5 and 30),
  -- Dia da semana ISO (1 = segunda … 7 = domingo) e hora, em Europe/Lisbon.
  weekday smallint not null default 1 check (weekday between 1 and 7),
  hour smallint not null default 8 check (hour between 0 and 23),
  -- Empresas novas entram logo como leads (os sites são analisados se audit).
  auto_add boolean not null default false,
  audit boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_id uuid references public.lead_generation_runs(id) on delete set null,
  -- Porque é que a última execução não arrancou (ex.: sem fornecedor de IA).
  last_error text check (last_error is null or length(last_error) <= 1000),
  -- Última vez que o cron passou por aqui (mostra se o agendador está a funcionar).
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, sector_id) references public.sectors (workspace_id, id) on delete set null (sector_id)
);
create index lead_generation_schedules_ws_idx on public.lead_generation_schedules (workspace_id, created_at);
create index lead_generation_schedules_due_idx on public.lead_generation_schedules (next_run_at) where enabled;
create trigger lead_generation_schedules_touch before update on public.lead_generation_schedules
  for each row execute function public.vnd_touch_updated_at();

alter table public.lead_generation_schedules enable row level security;
create policy lead_generation_schedules_member_all on public.lead_generation_schedules for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Que pesquisas vieram de um agendamento (e quantos leads entraram sozinhos).
alter table public.lead_generation_runs
  add column schedule_id uuid references public.lead_generation_schedules(id) on delete set null,
  add column auto_added integer not null default 0 check (auto_added >= 0);
create index lead_generation_runs_schedule_idx on public.lead_generation_runs (schedule_id, created_at desc)
  where schedule_id is not null;
