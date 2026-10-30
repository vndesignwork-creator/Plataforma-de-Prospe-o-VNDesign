-- =============================================================================
-- Funil por período (Estatísticas)
-- Dos leads que entraram desde p_from: quantos chegaram a cada fase e quanto
-- tempo, em média, demoraram desde a fase anterior. Usa a linha do tempo
-- ("Estado alterado") — um cliente que saltou fases conta em todas até à sua;
-- o estado atual também conta (leads importados já noutro estado).
-- =============================================================================

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
grant execute on function public.stats_cohort_funnel(uuid, date) to authenticated;
