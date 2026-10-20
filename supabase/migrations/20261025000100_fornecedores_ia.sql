-- =============================================================================
-- Fornecedores de IA (Definições → Inteligência artificial)
--  - Cada workspace pode juntar chaves da Anthropic (Claude), OpenAI (ChatGPT),
--    OpenRouter ou de outro serviço compatível com a API da OpenAI.
--  - A chave fica cifrada (AES-256-GCM) pelo servidor; a base de dados nunca a
--    vê em claro e a API nunca a devolve (só os últimos carateres).
--  - Só o dono ou um administrador as junta, altera ou apaga.
--  - Qual usar no email com IA e no gerador de leads fica em workspaces.settings.ai.
-- =============================================================================

create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('anthropic', 'openai', 'openrouter', 'custom')),
  label text not null check (length(btrim(label)) between 1 and 60),
  base_url text check (base_url is null or (length(base_url) <= 300 and base_url ~ '^https?://')),
  api_key_ciphertext text not null check (length(api_key_ciphertext) between 20 and 4000),
  key_hint text not null check (length(key_hint) <= 20),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_providers_label_uq on public.ai_providers (workspace_id, lower(btrim(label)));
create index ai_providers_ws_idx on public.ai_providers (workspace_id, created_at);
create trigger ai_providers_touch before update on public.ai_providers
  for each row execute function public.vnd_touch_updated_at();

alter table public.ai_providers enable row level security;
create policy ai_providers_member_select on public.ai_providers for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy ai_providers_admin_insert on public.ai_providers for insert to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy ai_providers_admin_update on public.ai_providers for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy ai_providers_admin_delete on public.ai_providers for delete to authenticated
  using (public.is_workspace_admin(workspace_id));
