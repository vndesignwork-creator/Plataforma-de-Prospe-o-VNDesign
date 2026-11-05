-- Metas do mês: "Emails enviados" deixa de contar os emails das propostas
-- (essas contam em "Propostas enviadas"; antes contavam nas duas).
create or replace function public.goal_progress(p_workspace_id uuid, p_from date, p_to date, p_user uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'Europe/Lisbon') as t0,
           ((p_to + 1)::timestamp at time zone 'Europe/Lisbon') as t1
  ),
  acts as (
    select a.lead_id, a.type, a.payload, (a.created_at at time zone 'Europe/Lisbon')::date as day
      from public.lead_activities a cross join bounds b
     where a.workspace_id = p_workspace_id
       and a.created_at >= b.t0 and a.created_at < b.t1
       and (p_user is null or a.actor_user_id = p_user)
       and a.type in ('email_sent', 'call_logged', 'template_used', 'note')
  ),
  calls as (
    select distinct lead_id, day from acts
     where type = 'call_logged'
        or (type = 'note' and payload ->> 'via' = 'prospecting' and payload ->> 'channel' = 'phone')
  ),
  whatsapp as (
    select distinct lead_id, day from acts
     where (type = 'template_used' and (payload ->> 'via' = 'whatsapp' or payload ->> 'channel' = 'whatsapp'))
        or (type = 'note' and payload ->> 'via' = 'prospecting' and payload ->> 'channel' = 'whatsapp')
  ),
  period as (select public.stats_period(p_workspace_id, p_from, p_to) as s)
  select jsonb_build_object(
    -- Sem os emails das propostas (contam em "Propostas enviadas", não duas vezes).
    'emails', (select count(*) from acts where type = 'email_sent'
                 and coalesce(payload ->> 'template', '') not like 'Proposta %'),
    'calls', (select count(*) from calls),
    'whatsapp', (select count(*) from whatsapp),
    'proposals', (select (s ->> 'proposals')::int from period),
    'clients', (select (s ->> 'won')::int from period),
    'revenue', (select (s ->> 'received')::numeric from period)
  )
$$;
grant execute on function public.goal_progress(uuid, date, date, uuid) to authenticated;
