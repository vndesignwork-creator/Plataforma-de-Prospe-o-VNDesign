-- =============================================================================
-- Arquivar leads
--  - leads.archived_at: um lead arquivado sai da lista, do Kanban, do mapa, de
--    "Hoje" e do resumo diário, mas mantém histórico, propostas e estatísticas
--    e continua a contar na deteção de duplicados.
--  - Linha do tempo: "Arquivado" / "Reposto" (com "auto" quando foi o arquivo
--    automático).
--  - Arquivo automático (opcional, por workspace): settings.auto_archive_days =
--    N arquiva os leads em "Sem interesse" há mais de N dias. Corre no cron diário.
-- =============================================================================

alter type public.activity_type add value if not exists 'archived';
alter type public.activity_type add value if not exists 'unarchived';

alter table public.leads add column archived_at timestamptz;

-- A maior parte das consultas só quer os leads ativos.
create index leads_active_idx on public.leads (workspace_id, status) where archived_at is null;

-- -----------------------------------------------------------------------------
-- Linha do tempo: arquivar/repor regista a sua própria atividade
-- (e não um "Lead editado").
-- -----------------------------------------------------------------------------
create or replace function public.vnd_leads_log_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.vnd_actor_user_id();
  v_token uuid := public.vnd_actor_token_id();
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

  if new.archived_at is distinct from old.archived_at then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.id,
            (case when new.archived_at is null then 'unarchived' else 'archived' end)::public.activity_type,
            jsonb_strip_nulls(jsonb_build_object(
              'auto', case when current_setting('vnd.archive_auto', true) = '1' then true end)),
            v_actor, v_token);
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
       'status', 'updated_at', 'status_changed_at', 'kanban_position', 'number', 'archived_at',
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

  -- Importações (que registam "Importado") e ações de follow-up (que registam a
  -- sua própria atividade) não geram também um "Lead editado".
  if v_source = 'import' or current_setting('vnd.skip_update_log', true) = '1' then
    return new;
  end if;

  if coalesce(cardinality(v_fields), 0) > 0 then
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.id, 'updated', jsonb_build_object('fields', to_jsonb(v_fields)), v_actor, v_token);
  end if;

  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Arquivo automático (cron diário, com a chave de serviço)
-- -----------------------------------------------------------------------------
create or replace function public.auto_archive_leads(p_dry_run boolean default false)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ws record;
  v_count integer := 0;
  v_n integer;
begin
  perform set_config('vnd.archive_auto', '1', true);
  for v_ws in
    select w.id, (w.settings ->> 'auto_archive_days')::integer as days
      from public.workspaces w
     where (w.settings ->> 'auto_archive_days') ~ '^[0-9]+$'
  loop
    if p_dry_run then
      select count(*) into v_n
        from public.leads l
       where l.workspace_id = v_ws.id and l.status = 'sem_interesse'
         and l.archived_at is null and l.anonymized_at is null
         and l.status_changed_at < now() - make_interval(days => v_ws.days);
    else
      update public.leads l set archived_at = now()
       where l.workspace_id = v_ws.id and l.status = 'sem_interesse'
         and l.archived_at is null and l.anonymized_at is null
         and l.status_changed_at < now() - make_interval(days => v_ws.days);
      get diagnostics v_n = row_count;
    end if;
    v_count := v_count + v_n;
  end loop;
  perform set_config('vnd.archive_auto', '', true);
  return v_count;
end
$$;

revoke execute on function public.auto_archive_leads(boolean) from public, anon, authenticated;
grant execute on function public.auto_archive_leads(boolean) to service_role;

-- -----------------------------------------------------------------------------
-- Dashboard: os arquivados contam no total, no funil e nas estatísticas, mas
-- não nos "Leads ativos" nem no "Valor do pipeline".
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
