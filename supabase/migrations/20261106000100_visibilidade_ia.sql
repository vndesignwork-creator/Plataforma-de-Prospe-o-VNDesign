-- =============================================================================
-- GEO: "Aparece nas IAs?" — testes de visibilidade de um lead nas respostas de
-- uma IA com pesquisa na internet (Claude, ChatGPT, OpenRouter).
--  - questions: as perguntas feitas (as de um cliente típico desse negócio).
--  - results: por pergunta, a resposta resumida, as empresas recomendadas e se
--    o lead apareceu.
--  - competitors: as empresas que aparecem no lugar do lead (agregado).
-- Corre em segundo plano (status running → done / error).
-- =============================================================================

create table public.ai_visibility_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid not null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  questions jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  mentioned_count integer not null default 0 check (mentioned_count >= 0),
  -- A quem se perguntou (ex.: "ChatGPT") e com que modelo.
  assistant text,
  model text,
  searches integer,
  cost_usd numeric(10, 4),
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index ai_visibility_checks_lead_idx on public.ai_visibility_checks (lead_id, created_at desc);

alter table public.ai_visibility_checks enable row level security;
create policy ai_visibility_checks_member_all on public.ai_visibility_checks for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
