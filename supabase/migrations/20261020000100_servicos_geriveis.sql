-- =============================================================================
-- Serviços geríveis (Definições → Serviços)
--  - Tabela services por workspace (nome, nome curto, categoria, ícone, ordem,
--    escondido). Os 8 serviços do site vndesign.pt passam a ser o ponto de partida.
--  - As verificações fixas (lista de chaves em leads.services,
--    service_packages.service e task_templates.service) passam a ser triggers que
--    confirmam que o serviço existe no workspace.
--  - Nova categoria "outros" (Outros serviços), além de web e grafico.
--  - dashboard_summary: "por serviço" lê a tabela em vez da lista fixa.
-- =============================================================================

create table public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,48}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  short_label text check (short_label is null or length(btrim(short_label)) between 1 and 14),
  category text not null default 'outros' check (category in ('web', 'grafico', 'outros')),
  icon text check (icon is null or icon ~ '^[a-z0-9-]{1,32}$'),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create unique index services_label_uq on public.services (workspace_id, lower(btrim(label)));
create index services_ws_idx on public.services (workspace_id, sort_order);
create trigger services_touch before update on public.services
  for each row execute function public.vnd_touch_updated_at();
alter table public.services enable row level security;
create policy services_member_all on public.services for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- A chave não muda (está guardada nos leads, pacotes e listas de tarefas).
create or replace function public.vnd_services_key_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.key <> old.key then
    raise exception 'A chave de um serviço não pode ser alterada.' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger services_key_immutable before update of key on public.services
  for each row execute function public.vnd_services_key_immutable();

-- Os 8 serviços do site (as mesmas chaves de sempre).
create or replace function public.seed_services(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.services (workspace_id, key, label, short_label, category, icon, sort_order)
  values
    (p_workspace_id, 'landing_page', 'Landing Pages', 'Landing', 'web', 'layout', 1),
    (p_workspace_id, 'site_institucional', 'Sites Institucionais', 'Site', 'web', 'building', 2),
    (p_workspace_id, 'blog', 'Blogs Personalizados', 'Blog', 'web', 'newspaper', 3),
    (p_workspace_id, 'loja_online', 'Pequenas Lojas', 'Loja', 'web', 'cart', 4),
    (p_workspace_id, 'identidade_visual', 'Identidade Visual', 'Identidade', 'grafico', 'pen', 5),
    (p_workspace_id, 'flyers_cartazes', 'Flyers e Cartazes', 'Flyers', 'grafico', 'file-image', 6),
    (p_workspace_id, 'posts_redes', 'Posts Rede Social', 'Posts', 'grafico', 'images', 7),
    (p_workspace_id, 'estampas', 'Estampas T-shirts', 'T-shirts', 'grafico', 'shirt', 8)
  on conflict (workspace_id, key) do nothing
$$;
revoke execute on function public.seed_services(uuid) from public, anon, authenticated;

create or replace function public.vnd_workspaces_seed_services()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_services(new.id);
  return new;
end
$$;
create trigger workspaces_seed_services after insert on public.workspaces
  for each row execute function public.vnd_workspaces_seed_services();

select public.seed_services(id) from public.workspaces;

-- -----------------------------------------------------------------------------
-- Validação: em vez da lista fixa, o serviço tem de existir no workspace
-- (os escondidos continuam válidos nos leads que já os têm).
-- -----------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_services_check;
alter table public.service_packages drop constraint if exists service_packages_service_check;
alter table public.service_packages drop constraint if exists service_packages_category_check;
alter table public.service_packages
  add constraint service_packages_category_check check (category in ('web', 'grafico', 'outros'));
alter table public.task_templates drop constraint if exists task_templates_service_check;

create or replace function public.vnd_check_lead_services()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unknown text;
begin
  if cardinality(new.services) = 0 then
    return new;
  end if;
  select s into v_unknown
    from unnest(new.services) s
   where not exists (select 1 from public.services x where x.workspace_id = new.workspace_id and x.key = s)
   limit 1;
  if v_unknown is not null then
    raise exception 'Serviço desconhecido: %', v_unknown using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger leads_check_services before insert or update of services on public.leads
  for each row execute function public.vnd_check_lead_services();

create or replace function public.vnd_check_row_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service is not null
     and not exists (select 1 from public.services x where x.workspace_id = new.workspace_id and x.key = new.service) then
    raise exception 'Serviço desconhecido: %', new.service using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger service_packages_check_service before insert or update of service on public.service_packages
  for each row execute function public.vnd_check_row_service();
create trigger task_templates_check_service before insert or update of service on public.task_templates
  for each row execute function public.vnd_check_row_service();

-- Apagar um serviço (só sem leads — a API confirma) desliga-o dos pacotes e das listas de tarefas.
create or replace function public.vnd_services_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.service_packages set service = null where workspace_id = old.workspace_id and service = old.key;
  update public.task_templates set service = null where workspace_id = old.workspace_id and service = old.key;
  return old;
end
$$;
create trigger services_before_delete before delete on public.services
  for each row execute function public.vnd_services_before_delete();

-- -----------------------------------------------------------------------------
-- Dashboard: leads por serviço a partir da tabela services
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_workspace_id uuid, p_weeks integer default 12)
returns jsonb
language sql stable
set search_path = ''
as $$
  with l as (
    select * from public.leads where workspace_id = p_workspace_id
  ),
  stage as (
    -- 0 identificado · 1 contactado · 2 respondeu · 3 reunião · 4 proposta · 5 cliente
    select l.id,
           greatest(
             case l.status
               when 'identificado' then 0 when 'contactado' then 1 when 'respondeu' then 2
               when 'reuniao' then 3 when 'proposta_enviada' then 4 when 'cliente' then 5
               when 'sem_interesse' then 1 -- sem interesse implica ter havido contacto
               else 0 end,
             coalesce((
               select max(case a.payload ->> 'to'
                 when 'contactado' then 1 when 'respondeu' then 2 when 'reuniao' then 3
                 when 'proposta_enviada' then 4 when 'cliente' then 5 else 0 end)
               from public.lead_activities a
               where a.lead_id = l.id and a.type = 'status_changed'
             ), 0)
           ) as rank
      from l
  ),
  totals as (
    select count(*)::int as total,
           count(*) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada')
                              and archived_at is null)::int as active,
           count(*) filter (where status = 'cliente')::int as won,
           count(*) filter (where status = 'sem_interesse')::int as lost,
           count(*) filter (where status = 'em_pausa')::int as paused,
           count(*) filter (where status <> 'identificado')::int as contacted,
           count(*) filter (where archived_at is not null)::int as archived,
           coalesce(sum(estimated_value), 0)::numeric as value_total,
           coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric as value_won,
           coalesce(sum(estimated_value) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada')
                                                   and archived_at is null), 0)::numeric as value_pipeline
      from l
  ),
  weeks as (
    select generate_series(
             date_trunc('week', (now() at time zone 'Europe/Lisbon')::date - (p_weeks - 1) * 7),
             date_trunc('week', (now() at time zone 'Europe/Lisbon')::date),
             interval '1 week')::date as week_start
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) || jsonb_build_object(
        'conversion_rate', case when t.total = 0 then 0 else round(t.won::numeric / t.total, 4) end,
        'conversion_rate_contacted', case when t.contacted = 0 then 0 else round(t.won::numeric / t.contacted, 4) end
      ) from totals t),
    'by_sector', coalesce((
      select jsonb_agg(x order by x.sort_order, x.name) from (
        select s.id, s.name, s.emoji, s.sort_order,
               count(l.id)::int as count, coalesce(sum(l.estimated_value), 0)::numeric as value
          from public.sectors s
          left join l on l.sector_id = s.id
         where s.workspace_id = p_workspace_id and (s.archived_at is null or l.id is not null)
         group by s.id
        union all
        select null, 'Sem setor', null, 9999, count(*)::int, coalesce(sum(estimated_value), 0)::numeric
          from l where l.sector_id is null
        having count(*) > 0
      ) x), '[]'::jsonb),
    'by_status', (
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', coalesce(c.count, 0)) order by s.ord)
        from unnest(enum_range(null::public.lead_status)) with ordinality s(status, ord)
        left join (select status, count(*)::int as count from l group by status) c on c.status = s.status),
    'by_service', (
      select coalesce(jsonb_agg(jsonb_build_object('service', s.service, 'count', s.count, 'won', s.won)
                                order by s.ord), '[]'::jsonb)
        from (
          -- Os serviços do workspace (Definições → Serviços), pela ordem definida;
          -- os escondidos só aparecem se ainda houver leads com eles.
          select sv.key as service,
                 row_number() over (order by sv.sort_order, sv.label) as ord,
                 count(l.id)::int as count,
                 count(l.id) filter (where l.status = 'cliente')::int as won
            from public.services sv
            left join l on sv.key = any(l.services)
           where sv.workspace_id = p_workspace_id
           group by sv.id
          having sv.archived_at is null or count(l.id) > 0
        ) s),
    'by_channel', (
      select jsonb_agg(jsonb_build_object('channel', s.channel, 'count', coalesce(c.count, 0)) order by s.ord)
        from (select channel, ord from unnest(enum_range(null::public.lead_channel)) with ordinality u(channel, ord)
              union all select null, 99) s
        left join (select channel, count(*)::int as count from l group by channel) c
          on c.channel is not distinct from s.channel),
    'funnel', (
      select jsonb_agg(jsonb_build_object('stage', f.stage, 'count',
               (select count(*) from stage where stage.rank >= f.rank)::int) order by f.rank)
        from (values (0, 'identificado'), (1, 'contactado'), (2, 'respondeu'),
                     (3, 'reuniao'), (4, 'proposta_enviada'), (5, 'cliente')) f(rank, stage)),
    'weekly', (
      select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'count', (
               select count(*) from l
                where coalesce(l.suggested_on, (l.created_at at time zone 'Europe/Lisbon')::date) >= w.week_start
                  and coalesce(l.suggested_on, (l.created_at at time zone 'Europe/Lisbon')::date) < w.week_start + 7
             )::int) order by w.week_start)
        from weeks w)
  )
$$;


-- Quantos leads têm cada serviço (Definições → Serviços).
create or replace function public.service_lead_counts(p_workspace_id uuid)
returns table (key text, lead_count integer)
language sql stable
set search_path = ''
as $$
  select s, count(*)::int
    from public.leads l, unnest(l.services) s
   where l.workspace_id = p_workspace_id
   group by s
$$;
revoke execute on function public.service_lead_counts(uuid) from public, anon;
grant execute on function public.service_lead_counts(uuid) to authenticated, service_role;
