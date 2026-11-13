-- =============================================================================
-- Registo das mudanças fora dos leads (Definições → Registo de alterações): quem mudou
-- definições, exportou leads, convidou ou removeu alguém, criou ou revogou chaves da API,
-- apagou de vez… e quando. As mudanças nos leads já ficam na linha do tempo de cada um
-- (Equipa → Atividade).
-- =============================================================================
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  at timestamptz not null default now(),
  actor_user_id uuid references auth.users (id) on delete set null,
  -- Por token de integração (API), em vez de uma pessoa.
  actor_token_id uuid,
  action text not null check (char_length(action) between 1 and 60),
  summary text not null check (char_length(summary) between 1 and 300)
);
create index if not exists audit_events_recent on public.audit_events (workspace_id, at desc);
alter table public.audit_events enable row level security;
-- Só o dono e os administradores leem o registo; escreve só a plataforma (chave de serviço).
drop policy if exists audit_events_staff_select on public.audit_events;
create policy audit_events_staff_select on public.audit_events for select to authenticated
  using (public.is_workspace_staff(workspace_id));
