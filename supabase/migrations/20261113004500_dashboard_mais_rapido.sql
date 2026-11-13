-- Dashboard mais rápido: os "contactados" usavam uma subconsulta por lead à lista das fases
-- (com milhares de leads, milhões de comparações). Agora juntam-se uma vez; o resultado é o mesmo.
create or replace function public.dashboard_summary(p_workspace_id uuid, p_weeks integer default 12)
returns jsonb
language sql stable
set search_path = ''
as $$
  -- Só os registos principais: um projeto novo de um cliente que volta (client_of)
  -- não é um lead novo nem outro cliente; o valor dele soma ao valor ganho.
  -- Os anonimizados (RGPD) ficam de fora, como na lista de leads e nas outras estatísticas.
  with l as (
    select * from public.leads where workspace_id = p_workspace_id and client_of is null and anonymized_at is null
  ),
  extra as (
    select coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric as value
      from public.leads where workspace_id = p_workspace_id and client_of is not null and anonymized_at is null
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
           -- Contactados: já houve contacto (data do 1.º contacto ou uma fase depois de "Identificado",
           -- também pela linha do tempo). "Em pausa" sem contacto não conta.
           count(*) filter (where first_contact_on is not null or st.rank >= 1)::int as contacted,
           count(*) filter (where archived_at is not null)::int as archived,
           coalesce(sum(estimated_value), 0)::numeric as value_total,
           coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric + (select value from extra) as value_won,
           coalesce(sum(estimated_value) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada')
                                                   and archived_at is null), 0)::numeric as value_pipeline
      from l
      left join stage st on st.id = l.id
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

-- Cidades dos leads (filtro "Cidade"): contadas na base de dados, em vez de trazer todos os leads.
create or replace function public.lead_city_counts(p_workspace_id uuid)
returns table (city text, count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select btrim(l.city) as city, count(*)::int as count
    from public.leads l
   where l.workspace_id = p_workspace_id and l.anonymized_at is null and l.city is not null and btrim(l.city) <> ''
   group by btrim(l.city)
$$;
grant execute on function public.lead_city_counts(uuid) to authenticated;
