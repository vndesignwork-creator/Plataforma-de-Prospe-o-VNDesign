-- =============================================================================
-- Equipa de prospeção.
--  - is_workspace_staff(): membro que não é prospetor (dono, administrador,
--    membro). As tabelas de projetos, pagamentos, propostas, contratos,
--    despesas, horas, entregas, kit da marca, acessos, pacotes (preços),
--    importações e pesquisas automáticas passam a ser só da "staff": um
--    prospetor não lhes chega, nem pela API nem diretamente.
--  - leads.assigned_to: o responsável pelo lead (a fila da prospeção do
--    prospetor mostra os dele).
--  - workspace_invites: convites para a equipa (link /equipa/<código>).
--  - handle_new_user: a conta de um convidado da equipa (vnd_team_invite nos
--    metadados) não cria workspace próprio.
-- =============================================================================

create or replace function public.is_workspace_staff(p_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid())
      and m.role <> 'prospector'
  )
$$;
revoke execute on function public.is_workspace_staff(uuid) from public, anon;
grant execute on function public.is_workspace_staff(uuid) to authenticated;

-- Só da staff (o prospetor não vê nem altera).
do $$
declare t text;
begin
  foreach t in array array[
    'lead_projects', 'lead_payments', 'proposals', 'lead_contracts', 'project_expenses',
    'project_time_entries', 'project_deliverables', 'project_revisions', 'project_briefings',
    'project_collaborators', 'lead_brand_kits', 'lead_accesses', 'service_packages',
    'import_jobs', 'lead_generation_schedules'
  ] loop
    execute format('drop policy if exists %1$s_member_all on public.%1$s', t);
    execute format(
      'create policy %1$s_staff_all on public.%1$s for all to authenticated
         using (public.is_workspace_staff(workspace_id))
         with check (public.is_workspace_staff(workspace_id))', t);
  end loop;
end $$;

-- Responsável pelo lead (null = sem responsável: é do dono).
alter table public.leads add column if not exists assigned_to uuid references auth.users (id) on delete set null;
create index if not exists leads_assigned_idx on public.leads (workspace_id, assigned_to) where assigned_to is not null;

-- Convites para a equipa.
create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (length(email) between 3 and 254),
  name text check (name is null or length(btrim(name)) between 1 and 120),
  role public.member_role not null default 'prospector' check (role in ('admin', 'prospector')),
  token text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index workspace_invites_ws_idx on public.workspace_invites (workspace_id, invited_at desc);
create unique index workspace_invites_pending_email_idx on public.workspace_invites (workspace_id, lower(email)) where accepted_at is null;
alter table public.workspace_invites enable row level security;
create policy workspace_invites_admin_all on public.workspace_invites for all to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Conta criada a partir de um convite (colaborador de projeto ou equipa): sem workspace próprio.
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
  -- Colaborador convidado para um projeto ou para a equipa: sem workspace próprio.
  if coalesce((new.raw_app_meta_data ->> 'vnd_collaborator')::boolean, false)
     or coalesce((v_meta ->> 'vnd_collaborator')::boolean, false)
     or coalesce((v_meta ->> 'vnd_team_invite')::boolean, false) then
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
