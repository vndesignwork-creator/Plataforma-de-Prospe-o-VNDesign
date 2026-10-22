-- =============================================================================
-- Imagens do site, aberturas dos emails e checklist de lançamento.
--  - site_audits.screenshots: capturas do site no telemóvel e no computador
--    (PageSpeed), guardadas no bucket privado "site-screenshots".
--  - email_tracking: um registo por email enviado pela plataforma (pixel de
--    abertura e cliques nos links). O servidor escreve com a chave de serviço;
--    os membros só leem.
--  - lead_projects.launch_*: checklist antes de publicar o site do cliente.
-- =============================================================================

alter type public.activity_type add value if not exists 'email_opened';
alter type public.activity_type add value if not exists 'email_clicked';

-- [{ "device": "mobile" | "desktop", "path", "width", "height" }]
alter table public.site_audits
  add column if not exists screenshots jsonb not null default '[]'::jsonb
    check (jsonb_typeof(screenshots) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-screenshots', 'site-screenshots', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.email_tracking (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  token text not null unique check (length(token) between 16 and 64),
  subject text not null default '' check (length(subject) <= 300),
  -- Os links do email, pela ordem (o clique leva o índice, nunca o endereço).
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  sent_at timestamptz not null default now(),
  opens integer not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  clicks integer not null default 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  -- Último aviso enviado (para não repetir notificações a cada abertura).
  notified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index email_tracking_lead_idx on public.email_tracking (lead_id, sent_at desc);
create index email_tracking_opened_idx on public.email_tracking (workspace_id, last_opened_at desc) where last_opened_at is not null;
alter table public.email_tracking enable row level security;
create policy email_tracking_member_read on public.email_tracking for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Checklist de lançamento: o endereço do site novo e o estado de cada ponto
-- ({ "<ponto>": { "done": bool, "auto": bool|null, "detail": text, "at": iso } }).
alter table public.lead_projects
  add column if not exists launch_url text check (launch_url is null or length(launch_url) <= 500),
  add column if not exists launch_checks jsonb not null default '{}'::jsonb
    check (jsonb_typeof(launch_checks) = 'object'),
  add column if not exists launch_checked_at timestamptz;
