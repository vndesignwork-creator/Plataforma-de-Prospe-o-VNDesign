-- =============================================================================
-- Enviar emails pela plataforma (Definições → Email de envio)
--  - Cada utilizador liga a sua caixa de correio (Gmail, Hostinger ou outro
--    SMTP); os emails aos leads saem dela, com o seu nome.
--  - A palavra-passe fica cifrada (AES-256-GCM) pelo servidor e nunca é devolvida.
--  - Limite diário de envios (por omissão 50), para proteger a reputação do domínio.
-- =============================================================================

create table public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'hostinger', 'custom')),
  from_name text not null check (length(btrim(from_name)) between 1 and 120),
  from_email text not null check (length(from_email) between 3 and 254 and from_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  smtp_host text not null check (length(btrim(smtp_host)) between 1 and 253),
  smtp_port integer not null check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default true,
  smtp_user text check (smtp_user is null or length(smtp_user) <= 254),
  password_ciphertext text check (password_ciphertext is null or length(password_ciphertext) between 20 and 2000),
  daily_limit integer not null default 50 check (daily_limit between 1 and 500),
  bcc_self boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create trigger mail_accounts_touch before update on public.mail_accounts
  for each row execute function public.vnd_touch_updated_at();

alter table public.mail_accounts enable row level security;
-- Só o próprio utilizador vê e gere a sua conta.
create policy mail_accounts_own_all on public.mail_accounts for all to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()))
  with check (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));

-- Contagem dos envios do dia (limite diário): emails enviados pela plataforma.
create index lead_activities_platform_email_idx on public.lead_activities (workspace_id, actor_user_id, created_at)
  where type = 'email_sent' and payload ->> 'via' = 'platform';
