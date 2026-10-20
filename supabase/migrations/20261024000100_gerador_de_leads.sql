-- =============================================================================
-- Gerador de leads (Claude com pesquisa na internet)
--  - Cada pesquisa fica guardada com o pedido, o estado (a correr / concluída /
--    erro), as empresas encontradas e o custo estimado.
--  - As empresas só passam a leads quando o utilizador as escolhe.
-- =============================================================================

create table public.lead_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  query text not null check (length(btrim(query)) between 1 and 500),
  city text check (city is null or length(btrim(city)) between 1 and 120),
  sector_id uuid,
  services text[] not null default '{}',
  max_results integer not null default 15 check (max_results between 1 and 30),
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  error text,
  -- Empresas encontradas (ver LeadCandidate em packages/core/src/lead-generation.ts).
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  model text,
  searches integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (workspace_id, sector_id) references public.sectors (workspace_id, id) on delete set null (sector_id)
);
create index lead_generation_runs_ws_idx on public.lead_generation_runs (workspace_id, created_at desc);
create trigger lead_generation_runs_touch before update on public.lead_generation_runs
  for each row execute function public.vnd_touch_updated_at();

alter table public.lead_generation_runs enable row level security;
create policy lead_generation_runs_member_all on public.lead_generation_runs for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
