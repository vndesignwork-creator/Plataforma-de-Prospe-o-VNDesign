-- =============================================================================
-- Estatísticas coerentes entre o Dashboard e as Estatísticas
-- * dashboard_summary: sem os leads anonimizados (como a lista e as outras
--   estatísticas); "contactados" = houve contacto (não conta "Em pausa" sem contacto).
-- * stats_cohort_funnel: sem os projetos novos de clientes que voltam (client_of),
--   que entravam como leads novos que passaram logo a Cliente.
-- * stats_period: os números de um período (Dashboard "Este mês"/"30 dias" e
--   Estatísticas → Comparar) com uma só definição: leads distintos, dias de Lisboa.
-- =============================================================================

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
           count(*) filter (where first_contact_on is not null
                              or (select s.rank from stage s where s.id = l.id) >= 1)::int as contacted,
           count(*) filter (where archived_at is not null)::int as archived,
           coalesce(sum(estimated_value), 0)::numeric as value_total,
           coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric + (select value from extra) as value_won,
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

create or replace function public.stats_cohort_funnel(p_workspace_id uuid, p_from date)
returns table (stage text, reached integer, avg_days numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with stages(stage, rank) as (
    values ('identificado', 0), ('contactado', 1), ('respondeu', 2), ('reuniao', 3), ('proposta_enviada', 4), ('cliente', 5)
  ),
  cohort as (
    select l.id, l.status::text as status, l.created_at
      from public.leads l
     where l.workspace_id = p_workspace_id
       and l.anonymized_at is null
       and l.client_of is null
       and (l.created_at at time zone 'Europe/Lisbon')::date >= p_from
  ),
  -- A primeira vez em cada fase: "identificado" é a criação; as outras vêm da linha do tempo.
  hits as (
    select c.id, 'identificado'::text as stage, c.created_at as at from cohort c
    union all
    select a.lead_id, a.payload ->> 'to', min(a.created_at)
      from public.lead_activities a
      join cohort c on c.id = a.lead_id
     where a.type = 'status_changed'
     group by a.lead_id, a.payload ->> 'to'
    union all
    -- O estado atual (sem data quando não há registo, ex.: importado já como Cliente).
    select c.id, c.status, null::timestamptz from cohort c
  ),
  ranked as (
    select h.id, s.rank, min(h.at) as at
      from hits h
      join stages s on s.stage = h.stage
     group by h.id, s.rank
  ),
  furthest as (
    select r.id, max(r.rank) as rank from ranked r group by r.id
  ),
  -- Tempo desde a fase anterior a que o lead chegou (com data): fases saltadas não contam.
  steps as (
    select cur.rank,
           extract(epoch from (cur.at - (
             select prev.at from ranked prev
              where prev.id = cur.id and prev.rank < cur.rank and prev.at is not null
              order by prev.rank desc limit 1
           ))) / 86400.0 as days
      from ranked cur
     where cur.at is not null and cur.rank > 0
  )
  select s.stage,
         (select count(*) from furthest f where f.rank >= s.rank)::integer,
         (select round(avg(st.days)::numeric, 1) from steps st where st.rank = s.rank and st.days >= 0)
    from stages s
   order by s.rank
$$;

create or replace function public.stats_period(p_workspace_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  -- Do início de p_from ao fim de p_to, na hora de Lisboa.
  with bounds as (
    select (p_from::timestamp at time zone 'Europe/Lisbon') as t0,
           ((p_to + 1)::timestamp at time zone 'Europe/Lisbon') as t1
  ),
  main as (
    -- Só os registos principais (um projeto novo de um cliente que volta não é um lead novo).
    select l.* from public.leads l
     where l.workspace_id = p_workspace_id and l.client_of is null and l.anonymized_at is null
  ),
  moved as (
    -- Mudanças de estado no período (cada lead conta uma vez por estado).
    select distinct a.payload ->> 'to' as status, a.lead_id
      from public.lead_activities a
      join main m on m.id = a.lead_id
      cross join bounds b
     where a.workspace_id = p_workspace_id and a.type = 'status_changed'
       and a.created_at >= b.t0 and a.created_at < b.t1
  ),
  won as (
    select lead_id from moved where status = 'cliente'
    union
    -- Criado já como Cliente no período (sem mudanças de estado), menos os que vêm de
    -- uma importação (clientes antigos de uma folha não são clientes ganhos agora).
    select m.id from main m cross join bounds b
     where m.status = 'cliente' and m.created_at >= b.t0 and m.created_at < b.t1
       and not exists (select 1 from public.lead_activities a
                        where a.lead_id = m.id and (a.type = 'status_changed'
                              or (a.type = 'created' and a.payload ->> 'source' = 'import')))
  )
  select jsonb_build_object(
    'new_leads', (select count(*) from main m, bounds b where m.created_at >= b.t0 and m.created_at < b.t1),
    'contacted', (select count(*) from main m where m.first_contact_on between p_from and p_to),
    'replied', (select count(*) from moved where status = 'respondeu'),
    'proposals', (select count(*) from moved where status = 'proposta_enviada'),
    'won', (select count(*) from won),
    'value_won', (select coalesce(sum(m.estimated_value), 0) from main m join won w on w.lead_id = m.id),
    'meetings', (select count(*) from public.lead_meetings mt, bounds b
                  where mt.workspace_id = p_workspace_id and mt.canceled_at is null
                    and mt.created_at >= b.t0 and mt.created_at < b.t1),
    'received', (select coalesce(sum(p.amount), 0) from public.lead_payments p
                  where p.workspace_id = p_workspace_id and p.paid_on between p_from and p_to)
  )
$$;
grant execute on function public.stats_period(uuid, date, date) to authenticated;
