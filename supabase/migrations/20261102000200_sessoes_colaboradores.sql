-- =============================================================================
-- Segurança da conta e colaboradores dos projetos.
--  - my_sessions() / end_my_session(): as sessões abertas do próprio
--    utilizador (Definições → Conta) e terminar uma delas.
--  - project_collaborators: pessoas convidadas para um projeto (programador,
--    fotógrafo…). Não são membros do workspace: o RLS não lhes dá acesso a
--    nada; o servidor mostra-lhes só as tarefas, entregas, briefing e horas
--    desse projeto (portal /colaborador).
--  - handle_new_user: a conta de um colaborador (vnd_collaborator nos metadados)
--    não cria workspace próprio. O servidor de autenticação grava o
--    app_metadata depois do insert, por isso vê-se também o user_metadata (só
--    tira o workspace, nunca dá acesso a nada).
-- =============================================================================

create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  current boolean
)
language sql stable security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'),
    s.user_agent,
    host(s.ip),
    s.aal::text,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  order by 3 desc nulls last
  limit 50
$$;
revoke execute on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

create or replace function public.end_my_session(p_session_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where id = p_session_id and user_id = auth.uid();
  return found;
end
$$;
revoke execute on function public.end_my_session(uuid) from public, anon;
grant execute on function public.end_my_session(uuid) to authenticated;

create table public.project_collaborators (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  email text not null check (length(email) between 3 and 254 and email = lower(btrim(email))),
  name text check (name is null or length(btrim(name)) between 1 and 120),
  -- Preenchido quando o convite é aceite (a conta do colaborador).
  user_id uuid references auth.users(id) on delete set null,
  token text not null unique check (length(token) between 16 and 64),
  status text not null default 'convidado' check (status in ('convidado', 'ativo')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lead_id, email),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index project_collaborators_user_idx on public.project_collaborators (user_id) where user_id is not null;
alter table public.project_collaborators enable row level security;
create policy project_collaborators_member_all on public.project_collaborators for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1));
begin
  -- Colaborador convidado para um projeto: sem workspace próprio.
  if coalesce((new.raw_app_meta_data ->> 'vnd_collaborator')::boolean, false)
     or coalesce((v_meta ->> 'vnd_collaborator')::boolean, false) then
    return new;
  end if;

  insert into public.workspaces (name)
  values (coalesce(nullif(btrim(v_meta ->> 'workspace_name'), ''), 'VNDesign'))
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  insert into public.signatures (workspace_id, user_id, full_name, role_title, company, phone, email, website, portfolio_url, project_links)
  values (
    v_workspace_id, new.id, v_name,
    coalesce(nullif(btrim(v_meta ->> 'role_title'), ''), 'Designer Gráfico & Web Designer'),
    'VNDesign',
    nullif(btrim(v_meta ->> 'phone'), ''),
    new.email,
    'https://vndesign.pt',
    'https://vndesign.pt/',
    array['https://estrelamadora.pt/', 'https://capecapital.pt/', 'https://capeliving.pt/', 'https://ecvalemourao.com/']
  );

  perform public.seed_workspace_defaults(v_workspace_id);
  return new;
end
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
