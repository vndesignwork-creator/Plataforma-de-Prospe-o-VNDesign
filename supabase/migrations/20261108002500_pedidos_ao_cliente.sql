-- O que falta o cliente enviar (textos, fotografias, logótipo, acessos…): a lista
-- fica no projeto e na página do cliente, onde ele marca como enviado e junta os
-- ficheiros (no armazenamento privado "brand-kits", pasta requests/).
create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'sent', 'done')),
  client_note text check (client_note is null or length(client_note) <= 2000),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  sent_at timestamptz,
  position double precision not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index if not exists client_requests_lead_idx on public.client_requests (lead_id, position);
create trigger client_requests_touch before update on public.client_requests
  for each row execute function public.vnd_touch_updated_at();

alter table public.client_requests enable row level security;
create policy client_requests_member_all on public.client_requests for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
