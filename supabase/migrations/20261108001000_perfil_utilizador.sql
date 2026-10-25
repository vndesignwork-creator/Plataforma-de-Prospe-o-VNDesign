-- Perfil de cada pessoa no workspace: o nome a mostrar (alcunha) e a foto.
-- Aparecem no menu, na equipa e no "Responsável". O nome completo da assinatura
-- continua a ser o dos emails.
create table public.user_profiles (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 60),
  avatar_path text check (avatar_path is null or length(avatar_path) <= 300),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.user_profiles enable row level security;
-- Toda a equipa vê os nomes e as fotos; cada pessoa só muda o seu.
create policy user_profiles_member_read on public.user_profiles for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy user_profiles_own_insert on public.user_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy user_profiles_own_update on public.user_profiles for update to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

-- Fotos (privadas: servidas por links temporários). Até 1 MB; o browser reduz antes de enviar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
