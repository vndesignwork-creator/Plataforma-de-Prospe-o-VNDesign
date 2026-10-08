-- =============================================================================
-- VNDesign Leads — modelo de dados base (Fase A)
-- Workspaces, membros, setores, leads, atividade, lista "não contactar",
-- modelos de contacto, assinaturas, ferramentas e preferências.
-- Todas as tabelas têm workspace_id e Row Level Security ativo.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.lead_status as enum (
  'identificado', 'contactado', 'respondeu', 'reuniao',
  'proposta_enviada', 'cliente', 'sem_interesse', 'em_pausa'
);

create type public.lead_channel as enum (
  'email', 'telefone', 'instagram', 'linkedin', 'google_maps', 'pessoal', 'outro'
);

-- "desconhecido" corresponde ao "--" da folha
create type public.mobile_status as enum ('sim', 'nao', 'parcial', 'desconhecido');

create type public.member_role as enum ('owner', 'admin', 'member');

create type public.activity_type as enum (
  'created', 'updated', 'status_changed', 'note', 'email_copied', 'email_mailto',
  'email_sent', 'call_logged', 'template_used', 'audit_run', 'ai_email_generated',
  'proposal_generated', 'imported', 'merged', 'follow_up_scheduled', 'anonymized'
);

create type public.template_kind as enum (
  'cold_email', 'follow_up', 'call_script', 'social_dm', 'linkedin',
  'short_message', 'general_email', 'proposal_structure'
);

-- -----------------------------------------------------------------------------
-- Funções de normalização (fonte de verdade para a deteção de duplicados).
-- O espelho em TypeScript está em packages/core/src/normalize.ts.
-- -----------------------------------------------------------------------------

-- unaccent "imutável" (o unaccent original é STABLE), para poder ser indexado.
create or replace function public.vnd_unaccent(p text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, p) $$;

-- Texto genérico: minúsculas, sem acentos, espaços colapsados.
create or replace function public.vnd_normalize_text(p text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(lower(public.vnd_unaccent(coalesce(p, ''))), '\s+', ' ', 'g')), '')
$$;

-- Nome de empresa: sem acentos/maiúsculas/pontuação e sem forma jurídica no fim
-- ("KUBRATECH, UNIPESSOAL, LDA" → "kubratech"; "MOBILITY 24, S.A." → "mobility 24").
-- A forma jurídica sai ANTES de tirar os acentos: "Clínica Sá" fica "clinica sa".
create or replace function public.vnd_normalize_company(p text)
returns text
language plpgsql immutable parallel safe
set search_path = ''
as $$
declare
  s text;
  prev text;
begin
  s := lower(coalesce(p, ''));
  s := replace(s, '.', '');                                        -- "s.a." → "sa", "l.da" → "lda"
  s := regexp_replace(s, '[!-/:-@[-`{-~–—‘’“”«»·•…[:space:]]+', ' ', 'g');  -- pontuação → espaço
  s := btrim(s);
  loop
    prev := s;
    s := regexp_replace(s, '\s+(lda|ltda|limitada|unipessoal|sa|crl|sgps|ltd)$', '');
    exit when s = prev;
  end loop;
  s := btrim(regexp_replace(public.vnd_unaccent(s), '[^a-z0-9]+', ' ', 'g'));
  return nullif(s, '');
end
$$;

-- Chave do website: domínio sem protocolo/www. Para redes sociais e agregadores
-- (Facebook, Restaurant Guru, Sluurpy…) o domínio não identifica a empresa,
-- por isso a chave inclui o caminho ("facebook.com/bogotacervejaria").
create or replace function public.vnd_website_key(p text)
returns text
language plpgsql immutable parallel safe
set search_path = ''
as $$
declare
  s text;
  host text;
  path text;
begin
  s := lower(btrim(coalesce(p, '')));
  if s = '' or s ~ '^-+$' then
    return null;
  end if;
  s := regexp_replace(s, '^[a-z][a-z0-9+.-]*://', '');
  s := regexp_replace(s, '[?#].*$', '');
  host := split_part(s, '/', 1);
  path := regexp_replace(substr(s, length(host) + 2), '/+$', '');
  host := regexp_replace(host, '^.*@', '');
  host := regexp_replace(host, ':[0-9]+$', '');
  host := regexp_replace(host, '\.$', '');
  host := regexp_replace(host, '^(www[0-9]?|m|mobile)\.', '');
  if host = '' or position('.' in host) = 0 then
    return null;
  end if;
  if host ~ '(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|linktr\.ee|restaurantguru\.com|sluurpy\.com|wanderlog\.com|tripadvisor\.[a-z.]+|thefork\.[a-z.]+|zomato\.com|google\.[a-z.]+|goo\.gl|wixsite\.com)$' then
    if path = '' then
      return null;  -- só "facebook.com" não identifica ninguém
    end if;
    return host || '/' || path;
  end if;
  return host;
end
$$;

-- Email: primeiro endereço válido encontrado, em minúsculas.
create or replace function public.vnd_normalize_email(p text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select lower(substring(coalesce(p, '') from '[^[:space:],;<>"]+@[^[:space:],;<>"]+\.[^[:space:],;<>"]+'))
$$;

-- Domínio empresarial do email (null para gmail, hotmail, sapo, etc.).
create or replace function public.vnd_email_business_domain(p_email text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    when split_part(p_email, '@', 2) in (
      'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.pt', 'outlook.com', 'outlook.pt',
      'live.com', 'live.com.pt', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'yahoo.pt', 'icloud.com',
      'me.com', 'sapo.pt', 'netcabo.pt', 'clix.pt', 'iol.pt', 'mail.pt', 'aeiou.pt', 'gmx.com',
      'gmx.net', 'protonmail.com', 'proton.me', 'vodafone.pt', 'meo.pt', 'nos.pt'
    ) then null
    else split_part(p_email, '@', 2)
  end
$$;

-- -----------------------------------------------------------------------------
-- Workspaces e membros
-- -----------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  lead_counter integer not null default 0,
  settings jsonb not null default jsonb_build_object(
    'timezone', 'Europe/Lisbon',
    'currency', 'EUR',
    'follow_up_days', 3,
    'opt_out_line', 'Se não quiser receber mais contactos, basta responder a este email.'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- O utilizador autenticado pertence ao workspace? (usado em todas as políticas RLS)
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid())
  )
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
$$;

-- updated_at automático
create or replace function public.vnd_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.vnd_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Setores (editáveis; junta "Setores" e "Sectores Oportunidades" da folha)
-- -----------------------------------------------------------------------------
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  emoji text,
  sort_order integer not null default 0,
  priority_rank integer check (priority_rank between 1 and 99),
  opportunity_notes text,
  sales_arguments text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug),
  unique (workspace_id, id)
);
create trigger sectors_touch before update on public.sectors
  for each row execute function public.vnd_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Leads
-- -----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  number integer not null,                       -- o "#" da folha, sequencial por workspace
  company_name text not null check (length(btrim(company_name)) between 1 and 300),
  sector_id uuid,
  website text,
  city text,
  address text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  problems text,
  pagespeed smallint check (pagespeed between 0 and 100),
  mobile public.mobile_status not null default 'desconhecido',
  email text,
  phone text,
  contact_name text,
  status public.lead_status not null default 'identificado',
  channel public.lead_channel,
  first_contact_on date,
  last_follow_up_on date,
  next_action_text text,
  next_action_on date,
  estimated_value numeric(12, 2) check (estimated_value >= 0),
  notes text,
  approach_angle text,
  source_url text,
  suggested_on date,
  email_subject text,
  email_body text,
  kanban_position double precision not null default 0,
  status_changed_at timestamptz not null default now(),
  anonymized_at timestamptz,
  -- Campos derivados, preenchidos por trigger (não editar diretamente)
  company_name_normalized text not null default '',
  website_key text,
  email_normalized text,
  email_domain text,
  search_text text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, number),
  unique (workspace_id, id),
  foreign key (workspace_id, sector_id)
    references public.sectors (workspace_id, id) on delete set null (sector_id)
);

create index leads_ws_status_idx on public.leads (workspace_id, status, kanban_position);
create index leads_ws_sector_idx on public.leads (workspace_id, sector_id);
create index leads_ws_city_idx on public.leads (workspace_id, lower(city));
create index leads_ws_suggested_idx on public.leads (workspace_id, suggested_on);
create index leads_ws_next_action_idx on public.leads (workspace_id, next_action_on)
  where status not in ('cliente', 'sem_interesse');
create index leads_ws_website_key_idx on public.leads (workspace_id, website_key) where website_key is not null;
create index leads_ws_email_idx on public.leads (workspace_id, email_normalized) where email_normalized is not null;
create index leads_ws_email_domain_idx on public.leads (workspace_id, email_domain) where email_domain is not null;
create index leads_name_trgm_idx on public.leads using gin (company_name_normalized extensions.gin_trgm_ops);
create index leads_search_trgm_idx on public.leads using gin (search_text extensions.gin_trgm_ops);

-- Atribui o número sequencial (#). SECURITY DEFINER para poder atualizar o contador.
create or replace function public.vnd_leads_assign_number()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.number is null then
    update public.workspaces
       set lead_counter = lead_counter + 1
     where id = new.workspace_id
    returning lead_counter into new.number;
  else
    -- Importação que preserva o # da folha: o contador acompanha o maior número.
    update public.workspaces
       set lead_counter = greatest(lead_counter, new.number)
     where id = new.workspace_id;
  end if;
  return new;
end
$$;

create trigger leads_assign_number before insert on public.leads
  for each row execute function public.vnd_leads_assign_number();

-- Campos derivados + regras de estado.
create or replace function public.vnd_leads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_today date;
  v_follow_up_days integer;
begin
  -- Nomes com quebras de linha (vindos da folha) passam a uma só linha.
  new.company_name := btrim(regexp_replace(new.company_name, '\s+', ' ', 'g'));
  new.company_name_normalized := coalesce(public.vnd_normalize_company(new.company_name), '');
  new.website_key := public.vnd_website_key(new.website);
  new.email_normalized := public.vnd_normalize_email(new.email);
  new.email_domain := public.vnd_email_business_domain(new.email_normalized);
  new.search_text := coalesce(public.vnd_normalize_text(concat_ws(' ',
    new.company_name, new.city, new.contact_name, new.email, new.website,
    new.phone, new.problems, new.notes, new.approach_angle)), '');

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    if new.status is distinct from old.status then
      new.status_changed_at := now();

      select w.settings into v_settings from public.workspaces w where w.id = new.workspace_id;
      v_today := (now() at time zone coalesce(v_settings ->> 'timezone', 'Europe/Lisbon'))::date;
      v_follow_up_days := coalesce((v_settings ->> 'follow_up_days')::integer, 3);

      if new.status = 'contactado' then
        new.first_contact_on := coalesce(new.first_contact_on, v_today);
        if new.last_follow_up_on is not distinct from old.last_follow_up_on then
          new.last_follow_up_on := v_today;
        end if;
        -- Agenda o follow-up se não houver próxima ação futura.
        if new.next_action_on is null or new.next_action_on <= v_today then
          new.next_action_on := v_today + v_follow_up_days;
          new.next_action_text := 'Enviar follow-up';
        end if;
      elsif new.status in ('cliente', 'sem_interesse') then
        new.next_action_text := null;
        new.next_action_on := null;
      end if;
    end if;
  end if;

  return new;
end
$$;

create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.vnd_leads_before_write();

-- -----------------------------------------------------------------------------
-- Linha do tempo de atividade
-- -----------------------------------------------------------------------------
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  type public.activity_type not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_token_id uuid,
  created_at timestamptz not null default now(),
  -- a atividade pertence sempre a um lead do mesmo workspace
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
create index lead_activities_ws_idx on public.lead_activities (workspace_id, created_at desc);

-- Regista automaticamente criação, mudanças de estado e edições.
-- A origem pode ser indicada com set_config('vnd.source', 'import', true).
create or replace function public.vnd_leads_log_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_token uuid := nullif(current_setting('vnd.actor_token_id', true), '')::uuid;
  v_source text := nullif(current_setting('vnd.source', true), '');
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.id, 'created',
            jsonb_strip_nulls(jsonb_build_object('source', v_source)), v_actor, v_token);
    return new;
  end if;

  -- Anonimização e junção registam a sua própria atividade.
  if new.anonymized_at is distinct from old.anonymized_at then
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.id, 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status), v_actor, v_token);

    if new.status = 'contactado' and new.next_action_on is distinct from old.next_action_on
       and new.next_action_on is not null then
      insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
      values (new.workspace_id, new.id, 'follow_up_scheduled',
              jsonb_build_object('on', new.next_action_on, 'text', new.next_action_text), v_actor, v_token);
    end if;
  end if;

  select array_agg(n.key order by n.key) into v_fields
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key not in (
       'status', 'updated_at', 'status_changed_at', 'kanban_position', 'number',
       'company_name_normalized', 'website_key', 'email_normalized', 'email_domain', 'search_text',
       -- definidos automaticamente pela regra de estado
       'first_contact_on', 'last_follow_up_on', 'next_action_on', 'next_action_text'
     );

  -- Datas/próxima ação editadas à mão (sem mudança de estado) também contam.
  if new.status is not distinct from old.status then
    select coalesce(v_fields, '{}') || array_agg(k order by k) into v_fields
      from unnest(array['first_contact_on', 'last_follow_up_on', 'next_action_on', 'next_action_text']) k
     where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);
  end if;

  if coalesce(cardinality(v_fields), 0) > 0 then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.id, 'updated', jsonb_build_object('fields', to_jsonb(v_fields)), v_actor, v_token);
  end if;

  return new;
end
$$;

create trigger leads_log_activity after insert or update on public.leads
  for each row execute function public.vnd_leads_log_activity();

-- -----------------------------------------------------------------------------
-- Lista "não contactar" (RGPD): bloqueia criação/importação da mesma empresa
-- -----------------------------------------------------------------------------
create table public.do_not_contact (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_name text not null,
  website text,
  email text,
  reason text,
  company_name_normalized text not null default '',
  website_key text,
  email_normalized text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index do_not_contact_ws_name_idx on public.do_not_contact (workspace_id, company_name_normalized);
create index do_not_contact_ws_web_idx on public.do_not_contact (workspace_id, website_key);
create index do_not_contact_ws_email_idx on public.do_not_contact (workspace_id, email_normalized);

create or replace function public.vnd_dnc_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.company_name := btrim(regexp_replace(new.company_name, '\s+', ' ', 'g'));
  new.company_name_normalized := coalesce(public.vnd_normalize_company(new.company_name), '');
  new.website_key := public.vnd_website_key(new.website);
  new.email_normalized := public.vnd_normalize_email(new.email);
  return new;
end
$$;

create trigger do_not_contact_before_write before insert or update on public.do_not_contact
  for each row execute function public.vnd_dnc_before_write();

-- -----------------------------------------------------------------------------
-- Modelos de contacto, assinaturas e ferramentas
-- -----------------------------------------------------------------------------
create table public.contact_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.template_kind not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  subject text,
  body text not null default '',
  sector_id uuid,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, sector_id)
    references public.sectors (workspace_id, id) on delete set null (sector_id)
);
create index contact_templates_ws_idx on public.contact_templates (workspace_id, kind, sort_order);
create trigger contact_templates_touch before update on public.contact_templates
  for each row execute function public.vnd_touch_updated_at();

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  role_title text,
  company text,
  phone text,
  email text,
  website text,
  portfolio_url text,
  project_links text[] not null default '{}',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index signatures_ws_user_idx on public.signatures (workspace_id, user_id);
create trigger signatures_touch before update on public.signatures
  for each row execute function public.vnd_touch_updated_at();

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  category text,
  purpose text,
  url text,
  free_plan text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tools_ws_idx on public.tools (workspace_id, sort_order);
create trigger tools_touch before update on public.tools
  for each row execute function public.vnd_touch_updated_at();

-- Preferências por utilizador (colunas visíveis da tabela, filtros guardados, tema…)
create table public.user_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_.-]{1,64}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, key)
);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.sectors enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.do_not_contact enable row level security;
alter table public.contact_templates enable row level security;
alter table public.signatures enable row level security;
alter table public.tools enable row level security;
alter table public.user_preferences enable row level security;

create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

create policy members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy members_admin on public.workspace_members for all to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- Tabelas de dados: qualquer membro do workspace lê e escreve.
do $$
declare
  t text;
begin
  foreach t in array array['sectors', 'leads', 'do_not_contact', 'contact_templates', 'tools'] loop
    execute format(
      'create policy %1$s_member_all on public.%1$s for all to authenticated
         using (public.is_workspace_member(workspace_id))
         with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end
$$;

-- Atividade: ler e acrescentar; só as notas próprias podem ser apagadas.
create policy lead_activities_select on public.lead_activities for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy lead_activities_insert on public.lead_activities for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and actor_user_id = (select auth.uid()));
create policy lead_activities_delete_own_notes on public.lead_activities for delete to authenticated
  using (public.is_workspace_member(workspace_id) and type = 'note' and actor_user_id = (select auth.uid()));

-- Assinaturas e preferências: cada utilizador gere as suas.
create policy signatures_select on public.signatures for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy signatures_own on public.signatures for all to authenticated
  using (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()))
  with check (public.is_workspace_member(workspace_id) and user_id = (select auth.uid()));

create policy user_preferences_own on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
