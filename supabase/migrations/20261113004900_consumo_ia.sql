-- =============================================================================
-- Consumo da IA: cada chamada (tokens e custo estimado pelo preço de tabela), para
-- Definições → Inteligência artificial → Consumo e créditos.
-- =============================================================================
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  -- Para que serviu (o formato pedido à IA: email, empresas, resumo_lead…).
  feature text not null check (char_length(feature) between 1 and 60),
  provider_kind text not null check (char_length(provider_kind) between 1 and 30),
  model text not null check (char_length(model) between 1 and 120),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  searches integer not null default 0,
  -- null: modelo sem preço conhecido (ex.: OpenAI, modelo próprio).
  cost_usd numeric(12, 6)
);
create index if not exists ai_usage_recent on public.ai_usage (workspace_id, at desc);
alter table public.ai_usage enable row level security;
-- Só o dono e os administradores veem o consumo; escreve só a plataforma (chave de serviço).
drop policy if exists ai_usage_staff_select on public.ai_usage;
create policy ai_usage_staff_select on public.ai_usage for select to authenticated
  using (public.is_workspace_staff(workspace_id));
