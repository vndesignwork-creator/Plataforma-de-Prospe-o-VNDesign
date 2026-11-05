-- Regras automáticas: "se o lead cumpre estas condições, faz isto" (etiqueta, fase,
-- responsável, tarefa, próxima ação). Correm ao criar/editar um lead e no cron diário;
-- cada regra aplica-se uma só vez a cada lead (automation_rule_runs).
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  enabled boolean not null default true,
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  position integer not null default 0,
  runs integer not null default 0,
  last_run_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_rules_ws_idx on public.automation_rules (workspace_id, enabled, position);
create trigger automation_rules_touch before update on public.automation_rules
  for each row execute function public.vnd_touch_updated_at();
alter table public.automation_rules enable row level security;
create policy automation_rules_member_all on public.automation_rules for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create table public.automation_rule_runs (
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  applied_at timestamptz not null default now(),
  primary key (rule_id, lead_id),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index automation_rule_runs_lead_idx on public.automation_rule_runs (lead_id);
alter table public.automation_rule_runs enable row level security;
create policy automation_rule_runs_member_all on public.automation_rule_runs for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
