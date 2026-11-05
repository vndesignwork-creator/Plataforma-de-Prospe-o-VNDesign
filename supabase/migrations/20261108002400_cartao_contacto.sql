-- Cartão de contacto partilhável (link /cartao/<código> e QR): o nome, os contactos
-- e o portefólio da assinatura, "Guardar contacto" (vCard) e um formulário para
-- quem o abre deixar o contacto (fica lead). Um por pessoa em cada workspace.
create table if not exists public.business_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  enabled boolean not null default true,
  bio text check (bio is null or length(bio) <= 300),
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create trigger business_cards_touch before update on public.business_cards
  for each row execute function public.vnd_touch_updated_at();

alter table public.business_cards enable row level security;
create policy business_cards_select on public.business_cards for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy business_cards_own on public.business_cards for all to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()))
  with check (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));
