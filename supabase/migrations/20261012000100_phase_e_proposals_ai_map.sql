-- =============================================================================
-- VNDesign Leads — Fase E: propostas em PDF, email com IA e mapa
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pacotes de serviços (usados nas propostas; editáveis nas Definições)
-- -----------------------------------------------------------------------------
create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  price numeric(10, 2) not null check (price >= 0),
  features text[] not null default '{}',
  delivery_days integer check (delivery_days between 1 and 365),
  recommended boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index service_packages_ws_idx on public.service_packages (workspace_id, sort_order);
create trigger service_packages_touch before update on public.service_packages
  for each row execute function public.vnd_touch_updated_at();
alter table public.service_packages enable row level security;
create policy service_packages_member_all on public.service_packages for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Pacotes iniciais (valores de referência — ajustar em Definições → Propostas).
create or replace function public.seed_service_packages(p_workspace_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.service_packages where workspace_id = p_workspace_id) then
    return;
  end if;
  insert into public.service_packages (workspace_id, name, description, price, features, delivery_days, recommended, sort_order)
  values
    (p_workspace_id, 'Essencial', 'Site de uma página, rápido e pronto para telemóvel — ideal para começar.', 450,
     array['Landing page de 1 página', 'Design responsivo (telemóvel, tablet, computador)', 'HTTPS e certificado SSL',
           'Formulário de contacto e botão de WhatsApp', 'Google Maps e horário', 'SEO base (título, descrição, Google Business)'],
     10, false, 1),
    (p_workspace_id, 'Profissional', 'Site completo para mostrar serviços e receber pedidos de contacto.', 950,
     array['Até 5 páginas', 'Design personalizado com a identidade da marca', 'Otimização de velocidade (PageSpeed 90+)',
           'SEO on-page em todas as páginas', 'Integração com redes sociais', 'Formação para editar conteúdos',
           '1 mês de suporte incluído'],
     21, true, 2),
    (p_workspace_id, 'Premium', 'Site à medida com funcionalidades de negócio (reservas, loja ou área de cliente).', 1800,
     array['Até 10 páginas', 'Reservas online ou loja (até 50 produtos)', 'Blog / notícias', 'Multilíngue (PT/EN)',
           'Analytics e relatórios mensais', '3 meses de suporte incluído'],
     35, false, 3),
    (p_workspace_id, 'Manutenção mensal', 'Atualizações, cópias de segurança e pequenas alterações.', 45,
     array['Atualizações de segurança', 'Cópias de segurança semanais', 'Até 1 h de alterações por mês', 'Monitorização do site'],
     null, false, 4);
end
$$;
revoke execute on function public.seed_service_packages(uuid) from public, anon, authenticated;

create or replace function public.vnd_workspaces_seed_packages()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.seed_service_packages(new.id);
  return new;
end
$$;
create trigger workspaces_seed_packages after insert on public.workspaces
  for each row execute function public.vnd_workspaces_seed_packages();

select public.seed_service_packages(id) from public.workspaces;

-- -----------------------------------------------------------------------------
-- Propostas (numeradas por workspace: 2026-001, 2026-002…)
-- -----------------------------------------------------------------------------
alter table public.workspaces add column proposal_counter integer not null default 0;

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  number integer not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  intro text,
  -- [{ "name", "description", "features": [...], "price", "quantity", "package_id" }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  total numeric(10, 2) not null default 0,
  valid_until date,
  payment_terms text,
  notes text,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aceite', 'recusada')),
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, number),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index proposals_lead_idx on public.proposals (lead_id, created_at desc);
create trigger proposals_touch before update on public.proposals
  for each row execute function public.vnd_touch_updated_at();
alter table public.proposals enable row level security;
create policy proposals_member_all on public.proposals for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.vnd_proposals_assign_number()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.workspaces
     set proposal_counter = proposal_counter + 1
   where id = new.workspace_id
  returning proposal_counter into new.number;
  return new;
end
$$;
create trigger proposals_assign_number before insert on public.proposals
  for each row execute function public.vnd_proposals_assign_number();

-- -----------------------------------------------------------------------------
-- Mapa: localização dos leads (geocodificação com OpenStreetMap/Nominatim)
-- -----------------------------------------------------------------------------
alter table public.leads
  -- ok = morada encontrada · approx = só a cidade · manual = posição escolhida no mapa
  add column geocode_status text check (geocode_status in ('ok', 'approx', 'manual', 'not_found')),
  add column geocoded_at timestamptz;

-- Grava a localização sem gerar "Lead editado" na linha do tempo.
create or replace function public.set_lead_location(
  p_lead_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_status text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads
     set latitude = p_latitude,
         longitude = p_longitude,
         geocode_status = p_status,
         geocoded_at = now()
   where id = p_lead_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lead não encontrado.';
  end if;
  perform set_config('vnd.skip_update_log', '', true);
end
$$;
revoke execute on function public.set_lead_location(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.set_lead_location(uuid, double precision, double precision, text) to authenticated, service_role;
