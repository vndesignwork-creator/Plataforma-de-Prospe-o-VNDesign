-- =============================================================================
-- VNDesign Leads — Fase B: Kanban, dashboard e importação
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kanban: posição dentro da coluna (estado). Valores menores aparecem primeiro.
-- Novos leads e leads que mudam de estado sem posição explícita vão para o topo.
-- -----------------------------------------------------------------------------
create or replace function public.vnd_top_position()
returns double precision
language sql volatile
set search_path = ''
as $$ select -extract(epoch from clock_timestamp())::double precision $$;

create or replace function public.vnd_leads_kanban_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.kanban_position = 0 then
      new.kanban_position := public.vnd_top_position();
    end if;
  elsif new.status is distinct from old.status
        and new.kanban_position is not distinct from old.kanban_position then
    new.kanban_position := public.vnd_top_position();
  end if;
  return new;
end
$$;

create trigger leads_kanban_position before insert or update on public.leads
  for each row execute function public.vnd_leads_kanban_position();

-- Leads existentes: ordem por data de criação (mais recentes no topo).
update public.leads
   set kanban_position = -extract(epoch from created_at)::double precision
 where kanban_position = 0;

-- -----------------------------------------------------------------------------
-- Dashboard (equivalente ao separador "📊 Dashboard" da folha)
--   ativos = identificado + contactado + respondeu + reunião + proposta enviada
--   taxa de conversão: clientes ÷ total  e  clientes ÷ contactados
--   funil: etapa mais alta alguma vez atingida (histórico de estados)
--   evolução semanal: por "Sugerido em" (ou data de criação), últimas 12 semanas
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
           count(*) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada'))::int as active,
           count(*) filter (where status = 'cliente')::int as won,
           count(*) filter (where status = 'sem_interesse')::int as lost,
           count(*) filter (where status = 'em_pausa')::int as paused,
           count(*) filter (where status <> 'identificado')::int as contacted,
           coalesce(sum(estimated_value), 0)::numeric as value_total,
           coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric as value_won,
           coalesce(sum(estimated_value) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada')), 0)::numeric as value_pipeline
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

-- -----------------------------------------------------------------------------
-- Histórico de importações
-- -----------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('csv', 'xlsx', 'api')),
  filename text,
  options jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  report jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index import_jobs_ws_idx on public.import_jobs (workspace_id, created_at desc);
alter table public.import_jobs enable row level security;
create policy import_jobs_member_all on public.import_jobs for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Duplicados e "não contactar" para várias linhas de uma vez (pré-visualização)
-- p_rows: [{ "company_name": "...", "website": "...", "email": "..." }, ...]
-- -----------------------------------------------------------------------------
create or replace function public.find_import_duplicates(p_workspace_id uuid, p_rows jsonb)
returns table (row_index integer, lead_id uuid, number integer, company_name text,
               status public.lead_status, reasons text[], strength text, score real)
language sql stable
set search_path = ''
as $$
  select (r.ord - 1)::int, d.lead_id, d.number, d.company_name, d.status, d.reasons, d.strength, d.score
    from jsonb_array_elements(p_rows) with ordinality r(value, ord)
    cross join lateral public.find_lead_duplicates(
      p_workspace_id, r.value ->> 'company_name', r.value ->> 'website', r.value ->> 'email') d
$$;

create or replace function public.check_import_do_not_contact(p_workspace_id uuid, p_rows jsonb)
returns table (row_index integer, entry_id uuid, company_name text, reason text)
language sql stable
set search_path = ''
as $$
  select (r.ord - 1)::int, d.id, d.company_name, d.reason
    from jsonb_array_elements(p_rows) with ordinality r(value, ord)
    cross join lateral public.check_do_not_contact(
      p_workspace_id, r.value ->> 'company_name', r.value ->> 'website', r.value ->> 'email') d
$$;

-- -----------------------------------------------------------------------------
-- Importação atómica. Cada item:
--   { "action": "create", "lead": {...}, "number": 12 }      → novo lead
--   { "action": "merge", "target_id": "...", "lead": {...} } → preenche os campos
--                                                              vazios do lead existente
-- Os valores já vêm validados pela API (Zod). Devolve o resultado por item.
-- -----------------------------------------------------------------------------
create or replace function public.import_leads(
  p_workspace_id uuid,
  p_job_id uuid,
  p_items jsonb,
  p_keep_numbers boolean default true
)
returns table (item_index integer, action text, lead_id uuid, number integer)
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_lead jsonb;
  v_idx integer := 0;
  v_number integer;
  v_id uuid;
  v_fields text[];
begin
  if not public.vnd_can_write(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Sem permissão neste workspace.';
  end if;

  -- A atividade "Lead criado" fica com origem "importação".
  perform set_config('vnd.source', 'import', true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_lead := coalesce(v_item -> 'lead', '{}'::jsonb);

    if v_item ->> 'action' = 'create' then
      v_number := nullif(v_item ->> 'number', '')::integer;
      if v_number is not null and (not p_keep_numbers or exists (
           select 1 from public.leads where workspace_id = p_workspace_id and leads.number = v_number)) then
        v_number := null;
      end if;

      insert into public.leads (
        workspace_id, number, company_name, sector_id, website, city, address, problems, pagespeed,
        mobile, email, phone, contact_name, status, channel, first_contact_on, last_follow_up_on,
        next_action_text, next_action_on, estimated_value, notes, approach_angle, source_url,
        suggested_on, email_subject, email_body, created_by
      ) values (
        p_workspace_id, v_number, v_lead ->> 'company_name', nullif(v_lead ->> 'sector_id', '')::uuid,
        v_lead ->> 'website', v_lead ->> 'city', v_lead ->> 'address', v_lead ->> 'problems',
        nullif(v_lead ->> 'pagespeed', '')::smallint,
        coalesce(nullif(v_lead ->> 'mobile', ''), 'desconhecido')::public.mobile_status,
        v_lead ->> 'email', v_lead ->> 'phone', v_lead ->> 'contact_name',
        coalesce(nullif(v_lead ->> 'status', ''), 'identificado')::public.lead_status,
        nullif(v_lead ->> 'channel', '')::public.lead_channel,
        nullif(v_lead ->> 'first_contact_on', '')::date, nullif(v_lead ->> 'last_follow_up_on', '')::date,
        v_lead ->> 'next_action_text', nullif(v_lead ->> 'next_action_on', '')::date,
        nullif(v_lead ->> 'estimated_value', '')::numeric, v_lead ->> 'notes', v_lead ->> 'approach_angle',
        v_lead ->> 'source_url', nullif(v_lead ->> 'suggested_on', '')::date,
        v_lead ->> 'email_subject', v_lead ->> 'email_body', auth.uid()
      )
      returning leads.id, leads.number into v_id, v_number;

      item_index := v_idx; action := 'created'; lead_id := v_id; number := v_number;
      return next;

    elsif v_item ->> 'action' = 'merge' then
      v_id := (v_item ->> 'target_id')::uuid;
      if not exists (select 1 from public.leads where id = v_id and workspace_id = p_workspace_id) then
        raise exception using errcode = 'P0002', message = 'Lead a juntar não encontrado (linha ' || (v_idx + 1) || ').';
      end if;

      -- Só preenche campos vazios no lead existente (nunca apaga dados).
      select array_agg(k) into v_fields
        from jsonb_each(v_lead) e(k, v)
        join lateral (select to_jsonb(l) -> e.k as cur from public.leads l where l.id = v_id) c on true
       where e.v is not null and e.v <> 'null'::jsonb and e.v <> '""'::jsonb
         and (c.cur is null or c.cur = 'null'::jsonb or c.cur = '""'::jsonb
              or (e.k = 'mobile' and c.cur = '"desconhecido"'::jsonb))
         and e.k in ('sector_id','website','city','address','problems','pagespeed','mobile','email','phone',
                     'contact_name','channel','first_contact_on','last_follow_up_on','next_action_text',
                     'next_action_on','estimated_value','notes','approach_angle','source_url','suggested_on',
                     'email_subject','email_body');

      if coalesce(cardinality(v_fields), 0) > 0 then
        update public.leads l set
          sector_id = case when 'sector_id' = any(v_fields) then (v_lead ->> 'sector_id')::uuid else l.sector_id end,
          website = case when 'website' = any(v_fields) then v_lead ->> 'website' else l.website end,
          city = case when 'city' = any(v_fields) then v_lead ->> 'city' else l.city end,
          address = case when 'address' = any(v_fields) then v_lead ->> 'address' else l.address end,
          problems = case when 'problems' = any(v_fields) then v_lead ->> 'problems' else l.problems end,
          pagespeed = case when 'pagespeed' = any(v_fields) then (v_lead ->> 'pagespeed')::smallint else l.pagespeed end,
          mobile = case when 'mobile' = any(v_fields) then (v_lead ->> 'mobile')::public.mobile_status else l.mobile end,
          email = case when 'email' = any(v_fields) then v_lead ->> 'email' else l.email end,
          phone = case when 'phone' = any(v_fields) then v_lead ->> 'phone' else l.phone end,
          contact_name = case when 'contact_name' = any(v_fields) then v_lead ->> 'contact_name' else l.contact_name end,
          channel = case when 'channel' = any(v_fields) then (v_lead ->> 'channel')::public.lead_channel else l.channel end,
          first_contact_on = case when 'first_contact_on' = any(v_fields) then (v_lead ->> 'first_contact_on')::date else l.first_contact_on end,
          last_follow_up_on = case when 'last_follow_up_on' = any(v_fields) then (v_lead ->> 'last_follow_up_on')::date else l.last_follow_up_on end,
          next_action_text = case when 'next_action_text' = any(v_fields) then v_lead ->> 'next_action_text' else l.next_action_text end,
          next_action_on = case when 'next_action_on' = any(v_fields) then (v_lead ->> 'next_action_on')::date else l.next_action_on end,
          estimated_value = case when 'estimated_value' = any(v_fields) then (v_lead ->> 'estimated_value')::numeric else l.estimated_value end,
          notes = case when 'notes' = any(v_fields) then v_lead ->> 'notes' else l.notes end,
          approach_angle = case when 'approach_angle' = any(v_fields) then v_lead ->> 'approach_angle' else l.approach_angle end,
          source_url = case when 'source_url' = any(v_fields) then v_lead ->> 'source_url' else l.source_url end,
          suggested_on = case when 'suggested_on' = any(v_fields) then (v_lead ->> 'suggested_on')::date else l.suggested_on end,
          email_subject = case when 'email_subject' = any(v_fields) then v_lead ->> 'email_subject' else l.email_subject end,
          email_body = case when 'email_body' = any(v_fields) then v_lead ->> 'email_body' else l.email_body end
        where l.id = v_id;
      end if;

      insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
      values (p_workspace_id, v_id, 'imported',
              jsonb_build_object('job_id', p_job_id, 'fields', coalesce(to_jsonb(v_fields), '[]'::jsonb)),
              auth.uid(), nullif(current_setting('vnd.actor_token_id', true), '')::uuid);

      select l.number into v_number from public.leads l where l.id = v_id;
      item_index := v_idx; action := 'merged'; lead_id := v_id; number := v_number;
      return next;
    end if;

    v_idx := v_idx + 1;
  end loop;
end
$$;

revoke execute on function public.dashboard_summary(uuid, integer) from public, anon;
revoke execute on function public.find_import_duplicates(uuid, jsonb) from public, anon;
revoke execute on function public.check_import_do_not_contact(uuid, jsonb) from public, anon;
revoke execute on function public.import_leads(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.dashboard_summary(uuid, integer) to authenticated, service_role;
grant execute on function public.find_import_duplicates(uuid, jsonb) to authenticated, service_role;
grant execute on function public.check_import_do_not_contact(uuid, jsonb) to authenticated, service_role;
grant execute on function public.import_leads(uuid, uuid, jsonb, boolean) to authenticated, service_role;
