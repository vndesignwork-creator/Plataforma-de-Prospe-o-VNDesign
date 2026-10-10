-- =============================================================================
-- Serviços: Web Design e Design Gráfico
--  - leads.services: serviços de interesse (vários por lead).
--  - service_packages.category (web | grafico) e .service (opcional).
--  - Pacotes de design gráfico de exemplo (preços de referência, a rever).
--  - Juntar leads junta também os serviços; dashboard com contagem por serviço.
-- As chaves dos serviços estão em packages/core/src/services.ts (SERVICES).
-- =============================================================================

alter table public.leads
  add column services text[] not null default '{}'
  check (services <@ array['landing_page','site_institucional','blog','loja_online','identidade_visual','flyers_cartazes','posts_redes','estampas']::text[]);
create index leads_services_idx on public.leads using gin (services);

alter table public.service_packages
  add column category text not null default 'web' check (category in ('web', 'grafico')),
  add column service text check (service in ('landing_page','site_institucional','blog','loja_online','identidade_visual','flyers_cartazes','posts_redes','estampas'));

-- Pacotes já existentes (os de exemplo): associa ao serviço correspondente.
update public.service_packages set service = 'landing_page' where name = 'Essencial' and service is null;
update public.service_packages set service = 'site_institucional' where name in ('Profissional', 'Premium') and service is null;

-- Portefólio de design gráfico na assinatura (emails sobre logótipos, flyers, posts…).
alter table public.signatures add column design_portfolio_url text;

-- -----------------------------------------------------------------------------
-- Pacotes de design gráfico (para workspaces novos e existentes)
-- -----------------------------------------------------------------------------
create or replace function public.seed_graphic_packages(p_workspace_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.service_packages where workspace_id = p_workspace_id and category = 'grafico') then
    return;
  end if;
  insert into public.service_packages
    (workspace_id, name, description, price, features, delivery_days, recommended, sort_order, category, service)
  values
    (p_workspace_id, 'Logótipo', 'Logótipo profissional, pronto para usar no site, nas redes e em impressão.', 180,
     array['3 propostas iniciais', '2 rondas de revisões', 'Versões horizontal, vertical e ícone',
           'Ficheiros para web e impressão (PNG, SVG, PDF)'],
     10, false, 11, 'grafico', 'identidade_visual'),
    (p_workspace_id, 'Identidade Visual', 'Marca completa e coerente em todos os pontos de contacto.', 450,
     array['Logótipo e variações', 'Paleta de cores e tipografia', 'Manual de marca (PDF)', 'Cartão de visita',
           'Kit para redes sociais (perfil e capas)'],
     21, false, 12, 'grafico', 'identidade_visual'),
    (p_workspace_id, 'Flyer / Cartaz', 'Peça gráfica para eventos, promoções ou menus.', 60,
     array['1 design (A5, A4 ou A3)', '2 rondas de revisões', 'Ficheiro pronto para impressão', 'Versão para redes sociais'],
     5, false, 13, 'grafico', 'flyers_cartazes'),
    (p_workspace_id, 'Redes Sociais — 12 posts/mês', 'Posts com a identidade da marca, prontos a publicar todos os meses.', 150,
     array['12 posts por mês (feed e stories)', 'Calendário editorial', 'Textos e hashtags', 'Ajustes ilimitados ao calendário'],
     null, false, 14, 'grafico', 'posts_redes'),
    (p_workspace_id, 'Estampa T-shirt', 'Design para t-shirts de equipa, eventos ou merchandising.', 50,
     array['Design da estampa (frente e/ou costas)', 'Mockup para aprovação', 'Ficheiro vetorial para serigrafia ou DTF'],
     5, false, 15, 'grafico', 'estampas');
end
$$;
revoke execute on function public.seed_graphic_packages(uuid) from public, anon, authenticated;

create or replace function public.vnd_workspaces_seed_packages()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.seed_service_packages(new.id);
  perform public.seed_graphic_packages(new.id);
  return new;
end
$$;

select public.seed_graphic_packages(id) from public.workspaces;

-- -----------------------------------------------------------------------------
-- Importação: acrescenta os serviços da folha aos leads criados/juntados
-- (sem gerar "Lead editado" — a importação já regista "Importado").
-- -----------------------------------------------------------------------------
create or replace function public.import_lead_services(p_workspace_id uuid, p_items jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.vnd_can_write(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Sem permissão neste workspace.';
  end if;
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads l set services = (
           select coalesce(array_agg(distinct s order by s), '{}')
             from unnest(l.services || array(select jsonb_array_elements_text(i -> 'services'))) s)
    from jsonb_array_elements(p_items) i
   where l.workspace_id = p_workspace_id and l.id = (i ->> 'lead_id')::uuid;
  perform set_config('vnd.skip_update_log', '', true);
end
$$;
revoke execute on function public.import_lead_services(uuid, jsonb) from public, anon;
grant execute on function public.import_lead_services(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Juntar leads: também os serviços de interesse
-- -----------------------------------------------------------------------------
create or replace function public.merge_leads(
  p_primary_id uuid,
  p_duplicate_ids uuid[],
  p_values jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_primary public.leads;
  v_numbers integer[];
  v_found integer;
  v_values jsonb;
  v_dup_services text[];
begin
  -- Sem duplicados = juntar dados de um registo novo (rascunho) ao lead existente.
  p_duplicate_ids := coalesce(p_duplicate_ids, '{}');
  if p_primary_id = any(p_duplicate_ids) then
    raise exception using errcode = '22023', message = 'O lead principal não pode estar na lista de duplicados.';
  end if;

  select * into v_primary from public.leads where id = p_primary_id for update;
  if not found or not public.vnd_can_write(v_primary.workspace_id) then
    raise exception using errcode = 'P0002', message = 'Lead principal não encontrado.';
  end if;

  select count(*), array_agg(l.number order by l.number)
    into v_found, v_numbers
    from public.leads l
   where l.id = any(p_duplicate_ids) and l.workspace_id = v_primary.workspace_id;
  if v_found <> cardinality(p_duplicate_ids) then
    raise exception using errcode = 'P0002', message = 'Um ou mais leads a juntar não foram encontrados.';
  end if;

  -- Só campos editáveis podem ser escolhidos.
  v_values := coalesce(p_values, '{}'::jsonb) - array[
    'id', 'workspace_id', 'number', 'created_at', 'created_by', 'updated_at', 'status_changed_at',
    'anonymized_at', 'company_name_normalized', 'website_key', 'email_normalized', 'email_domain',
    'search_text', 'kanban_position'
  ];
  v_primary := jsonb_populate_record(v_primary, v_values);

  select array_agg(distinct s) into v_dup_services
    from public.leads l, unnest(l.services) s
   where l.id = any(p_duplicate_ids);

  -- Move tudo o que pertence aos duplicados antes de os apagar
  -- (propostas e análises de site eram apagadas em cascata).
  update public.lead_activities set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.proposals set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.site_audits set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  delete from public.leads where id = any(p_duplicate_ids);

  -- A junção já fica registada como "merged": sem um "Lead editado" repetido.
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads set
    company_name = v_primary.company_name,
    sector_id = v_primary.sector_id,
    website = v_primary.website,
    city = v_primary.city,
    address = v_primary.address,
    latitude = v_primary.latitude,
    longitude = v_primary.longitude,
    problems = v_primary.problems,
    pagespeed = v_primary.pagespeed,
    mobile = v_primary.mobile,
    email = v_primary.email,
    phone = v_primary.phone,
    contact_name = v_primary.contact_name,
    status = v_primary.status,
    channel = v_primary.channel,
    first_contact_on = v_primary.first_contact_on,
    last_follow_up_on = v_primary.last_follow_up_on,
    next_action_text = v_primary.next_action_text,
    next_action_on = v_primary.next_action_on,
    estimated_value = v_primary.estimated_value,
    notes = v_primary.notes,
    approach_angle = v_primary.approach_angle,
    source_url = v_primary.source_url,
    suggested_on = v_primary.suggested_on,
    email_subject = v_primary.email_subject,
    email_body = v_primary.email_body,
    -- Serviços: os escolhidos, mais os dos duplicados (nada se perde).
    services = (
      select coalesce(array_agg(distinct s order by s), '{}')
        from unnest(v_primary.services || coalesce(v_dup_services, '{}')) s
    )
  where id = p_primary_id;
  perform set_config('vnd.skip_update_log', '', true);

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (
    v_primary.workspace_id, p_primary_id, 'merged',
    jsonb_build_object(
      'merged_numbers', coalesce(to_jsonb(v_numbers), '[]'::jsonb),
      'fields', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(v_values) k), '[]'::jsonb)
    ),
    public.vnd_actor_user_id(),
    public.vnd_actor_token_id()
  );

  return p_primary_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Dashboard: leads por serviço de interesse (e clientes)
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
          select k.service, k.ord,
                 count(l.id)::int as count,
                 count(l.id) filter (where l.status = 'cliente')::int as won
            from unnest(array['landing_page','site_institucional','blog','loja_online',
                              'identidade_visual','flyers_cartazes','posts_redes','estampas'])
                 with ordinality k(service, ord)
            left join l on k.service = any(l.services)
           group by k.service, k.ord
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
