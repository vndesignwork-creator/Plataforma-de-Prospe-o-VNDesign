-- =============================================================================
-- Fora da plataforma: Reuniões, Notas e a fase "Reunião" (pedido do dono).
--  1) Reuniões: apagadas de vez (a tabela fica, vazia, porque outras funções a
--     referem), com os registos "Reunião marcada/desmarcada" da linha do tempo.
--  2) Fase "Reunião": os leads nessa fase passam a "Respondeu" (sem contar como
--     mudança de fase nem mexer na data em que mudaram); no histórico, "Reunião"
--     passa a "Respondeu". O valor fica no enum do Postgres (não se pode tirar),
--     mas as funções do Dashboard e das Estatísticas deixam de o mostrar.
--  3) Notas: o campo "Notas" de todos os leads fica vazio (também nos "Lead editado"
--     da linha do tempo e no Reciclagem) e as notas escritas à mão na linha do tempo
--     saem. Os registos automáticos (formulário do site, regras, renovações…), que
--     têm sempre payload.via, ficam. A nota afixada fica.
-- =============================================================================

-- Os acertos de dados não contam como edições nem mudanças de fase (sem "Lead editado",
-- sem mexer em updated_at nem em status_changed_at).
alter table public.leads disable trigger leads_log_activity;
alter table public.leads disable trigger leads_before_write;

-- 1) Reuniões ---------------------------------------------------------------------
delete from public.lead_activities where type in ('meeting_scheduled', 'meeting_canceled');
delete from public.lead_meetings;
-- Os lembretes "📅 Reunião às …" no sino.
delete from public.notifications where kind = 'reminder' and title like '📅 Reunião%';

-- 2) Fase "Reunião" → "Respondeu" ---------------------------------------------------
update public.leads set status = 'respondeu' where status = 'reuniao';
update public.lead_activities
   set payload = jsonb_set(payload, '{to}', '"respondeu"')
 where type = 'status_changed' and payload ->> 'to' = 'reuniao';
update public.lead_activities
   set payload = jsonb_set(payload, '{from}', '"respondeu"')
 where type = 'status_changed' and payload ->> 'from' = 'reuniao';
-- "Respondeu → Respondeu" já não diz nada.
delete from public.lead_activities
 where type = 'status_changed' and payload ->> 'from' = 'respondeu' and payload ->> 'to' = 'respondeu';
update public.lead_trash set status = 'respondeu' where status = 'reuniao';
-- Links dos avisos ("leads a arrefecer") com a fase antiga.
update public.notifications set url = replace(replace(url, ',reuniao', ''), 'reuniao,', '')
 where url like '%reuniao%';
update public.lead_trash set snapshot = jsonb_set(snapshot, '{lead,status}', '"respondeu"')
 where snapshot #>> '{lead,status}' = 'reuniao';

-- Regras automáticas: "Está na fase Reunião" sai da condição (sem outra fase, a regra sai);
-- "Mudar para Reunião" passa a "Respondeu".
update public.automation_rules r
   set conditions = (
     select coalesce(jsonb_agg(
              case when c ->> 'type' = 'status_in'
                   then jsonb_set(c, '{values}', coalesce((select jsonb_agg(v) from jsonb_array_elements(c -> 'values') v where v <> '"reuniao"'), '[]'::jsonb))
                   else c end order by i), '[]'::jsonb)
       from jsonb_array_elements(r.conditions) with ordinality e(c, i))
 where r.conditions::text like '%"reuniao"%';
delete from public.automation_rules r
 where exists (select 1 from jsonb_array_elements(r.conditions) c
                where c ->> 'type' = 'status_in' and jsonb_array_length(c -> 'values') = 0);
update public.automation_rules r
   set actions = (
     select coalesce(jsonb_agg(
              case when a ->> 'type' = 'set_status' and a ->> 'value' = 'reuniao'
                   then jsonb_set(a, '{value}', '"respondeu"') else a end order by i), '[]'::jsonb)
       from jsonb_array_elements(r.actions) with ordinality e(a, i))
 where r.actions::text like '%"reuniao"%';

-- 3) Notas ------------------------------------------------------------------------
update public.leads
   set notes = null,
       search_text = coalesce(public.vnd_normalize_text(concat_ws(' ',
         company_name, city, contact_name, email, website, phone, problems, approach_angle)), '')
 where notes is not null;
update public.lead_activities
   set payload = jsonb_set(
         jsonb_set(payload, '{fields}', coalesce((select jsonb_agg(f) from jsonb_array_elements(payload -> 'fields') f where f <> '"notes"'), '[]'::jsonb)),
         '{changes}', coalesce(payload -> 'changes', '{}'::jsonb) - 'notes')
 where type = 'updated' and (payload -> 'fields') ? 'notes';
delete from public.lead_activities
 where type = 'updated' and jsonb_typeof(payload -> 'fields') = 'array' and jsonb_array_length(payload -> 'fields') = 0;
update public.lead_trash set snapshot = jsonb_set(snapshot, '{lead}', (snapshot -> 'lead') - 'notes')
 where (snapshot -> 'lead') ? 'notes';
-- No Reciclagem: as reuniões e as notas escritas à mão também saem das cópias.
update public.lead_trash
   set snapshot = jsonb_set(snapshot, '{children,lead_meetings}', '[]'::jsonb)
 where jsonb_typeof(snapshot #> '{children,lead_meetings}') = 'array';
update public.lead_trash
   set snapshot = jsonb_set(snapshot, '{children,lead_activities}', coalesce((
         select jsonb_agg(a order by i)
           from jsonb_array_elements(snapshot #> '{children,lead_activities}') with ordinality e(a, i)
          where a ->> 'type' not in ('meeting_scheduled', 'meeting_canceled')
            and not (a ->> 'type' = 'note' and not (coalesce(a -> 'payload', '{}'::jsonb) ? 'via'))), '[]'::jsonb))
 where jsonb_typeof(snapshot #> '{children,lead_activities}') = 'array';
-- As notas escritas à mão (e os resumos das "Notas com IA") na linha do tempo.
delete from public.lead_activities
 where type = 'note' and not (coalesce(payload, '{}'::jsonb) ? 'via');

alter table public.leads enable trigger leads_log_activity;
alter table public.leads enable trigger leads_before_write;

-- 4) Modelo de WhatsApp "lembrete de reunião" (usava {{reuniao}}) ---------------------
delete from public.contact_templates
 where kind = 'whatsapp' and (body like '%{{reuniao}}%' or body like '%{{reuniao_local}}%' or body like '%{{reuniao|%');

create or replace function public.seed_whatsapp_templates(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order integer;
begin
  select coalesce(max(sort_order), 0) into v_order from public.contact_templates where workspace_id = p_workspace_id;

  insert into public.contact_templates (workspace_id, kind, name, subject, body, category, is_default, sort_order)
  select p_workspace_id, 'whatsapp'::public.template_kind, t.name, null, t.body, null, false, v_order + t.n
  from (
    values
      (1, 'WhatsApp — primeiro contacto',
       E'Olá {{contacto}}! 👋\n\nO meu nome é {{meu_nome}}, sou designer freelancer na Amadora (VNDesign). Estive a ver a {{empresa}} e tenho uma ideia para vos ajudar a ter {{beneficio|uma imagem mais forte}}.\n\nPosso enviar alguns exemplos do meu trabalho por aqui?'),
      (2, 'WhatsApp — follow-up',
       E'Olá {{contacto}}! Só a confirmar se viu a minha mensagem de {{data}} sobre {{servicos|a imagem da vossa marca}}.\n\nSe fizer sentido, envio alguns exemplos ou uma proposta rápida, sem compromisso 🙂\n\n{{meu_nome}}')
  ) as t(n, name, body)
  where not exists (
    select 1 from public.contact_templates c where c.workspace_id = p_workspace_id and c.name = t.name
  );
end
$$;
revoke execute on function public.seed_whatsapp_templates(uuid) from public, anon, authenticated;

-- 5) Dashboard, Estatísticas e pontuação sem a fase "Reunião" ---------------------------
-- dashboard_summary_unchecked
create or replace function public.dashboard_summary_unchecked(p_workspace_id uuid, p_weeks integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- 0 identificado · 1 contactado · 2 respondeu · 4 proposta · 5 cliente
    select l.id,
           greatest(
             case l.status
               when 'identificado' then 0 when 'contactado' then 1 when 'respondeu' then 2
               when 'proposta_enviada' then 4 when 'cliente' then 5
               when 'sem_interesse' then 1 -- sem interesse implica ter havido contacto
               else 0 end,
             coalesce((
               select max(case a.payload ->> 'to'
                 when 'contactado' then 1 when 'respondeu' then 2
                 when 'proposta_enviada' then 4 when 'cliente' then 5 else 0 end)
               from public.lead_activities a
               where a.lead_id = l.id and a.type = 'status_changed'
             ), 0)
           ) as rank
      from l
  ),
  totals as (
    select count(*)::int as total,
           count(*) filter (where status in ('identificado','contactado','respondeu','proposta_enviada')
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
           coalesce(sum(estimated_value) filter (where status in ('identificado','contactado','respondeu','proposta_enviada')
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
        from (select u.status, u.ord from unnest(enum_range(null::public.lead_status)) with ordinality u(status, ord)
               where u.status <> 'reuniao') s
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
                     (4, 'proposta_enviada'), (5, 'cliente')) f(rank, stage)),
    'weekly', (
      select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'count', (
               select count(*) from l
                where coalesce(l.suggested_on, (l.created_at at time zone 'Europe/Lisbon')::date) >= w.week_start
                  and coalesce(l.suggested_on, (l.created_at at time zone 'Europe/Lisbon')::date) < w.week_start + 7
             )::int) order by w.week_start)
        from weeks w)
  )
$function$;

-- stats_cohort_funnel
create or replace function public.stats_cohort_funnel(p_workspace_id uuid, p_from date)
 RETURNS TABLE(stage text, reached integer, avg_days numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with stages(stage, rank) as (
    values ('identificado', 0), ('contactado', 1), ('respondeu', 2), ('proposta_enviada', 4), ('cliente', 5)
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
$function$;

-- vnd_lead_score
create or replace function public.vnd_lead_score(l leads)
 RETURNS TABLE(score integer, reasons text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_rank integer;
  v_web boolean;
  v_social boolean;
  v_problems integer;
  v_services integer := coalesce(cardinality(l.services), 0);
begin
  if l.status in ('cliente', 'sem_interesse', 'em_pausa') or l.archived_at is not null or l.anonymized_at is not null then
    return query select 0, '{}'::text[];
    return;
  end if;

  -- Fase do pipeline: quem já respondeu está mais perto de fechar.
  case l.status
    when 'respondeu' then v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Respondeu');
    when 'proposta_enviada' then v_score := v_score + 20; v_reasons := array_append(v_reasons, 'Proposta enviada');
    else null;
  end case;

  -- O site só conta se o lead precisa de web design (ou ainda não tem serviços).
  v_web := v_services = 0 or exists (
    select 1 from public.services s
     where s.workspace_id = l.workspace_id and s.key = any (l.services) and s.category = 'web'
  );
  if v_web then
    v_social := l.website ~* '(facebook|instagram|linktr\.ee|tiktok)\.';
    if nullif(btrim(coalesce(l.website, '')), '') is null then
      v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Sem site próprio');
    elsif v_social then
      v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Só tem redes sociais');
    else
      -- Em escala: PageSpeed 69 → +4 … PageSpeed 0 → +15 (antes: 15 abaixo de 50, 8 abaixo de 70).
      if l.pagespeed is not null and l.pagespeed < 70 then
        v_score := v_score + 4 + round((70 - l.pagespeed) * 11 / 70.0)::integer;
        v_reasons := array_append(v_reasons, case
          when l.pagespeed < 50 then format('Site lento (PageSpeed %s)', l.pagespeed)
          else format('Site pouco rápido (PageSpeed %s)', l.pagespeed) end);
      end if;
      if l.mobile = 'nao' then
        v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Site não funciona no telemóvel');
      elsif l.mobile = 'parcial' then
        v_score := v_score + 7; v_reasons := array_append(v_reasons, 'Site parcialmente adaptado ao telemóvel');
      end if;
    end if;
  end if;

  -- Problemas: um por linha (ou separados por ";"); cada um a mais conta um pouco.
  v_problems := (
    select count(*) from regexp_split_to_table(coalesce(l.problems, ''), E'[\\n;]+') p where btrim(p) <> ''
  );
  if v_problems > 0 then
    v_score := v_score + 5 + least(v_problems - 1, 4);
    v_reasons := array_append(v_reasons, case when v_problems > 1 then format('Problemas identificados (%s)', v_problems) else 'Problemas identificados' end);
  end if;

  if l.email is not null and l.phone is not null then
    v_score := v_score + 13; v_reasons := array_append(v_reasons, 'Tem email e telefone');
  elsif l.email is not null then
    v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Tem email');
  elsif l.phone is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Tem telefone');
  end if;
  if nullif(btrim(coalesce(l.contact_name, '')), '') is not null then
    v_score := v_score + 4; v_reasons := array_append(v_reasons, 'Pessoa de contacto');
  end if;

  if l.sector_id is not null then
    select s.priority_rank into v_rank from public.sectors s where s.id = l.sector_id;
    -- 1.º → 10, 2.º → 9, 3.º → 8; 4.º → 6, 5.º → 5, 6.º → 4.
    if v_rank between 1 and 3 then
      v_score := v_score + 11 - v_rank; v_reasons := array_append(v_reasons, 'Setor prioritário');
    elsif v_rank between 4 and 6 then
      v_score := v_score + 10 - v_rank; v_reasons := array_append(v_reasons, 'Setor com boas oportunidades');
    end if;
  end if;

  if l.estimated_value >= 1000 then
    v_score := v_score + 10 + least(floor((l.estimated_value - 1000) / 1000)::integer, 5);
    v_reasons := array_append(v_reasons, 'Valor estimado ≥ 1000 €');
  elsif l.estimated_value > 0 then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Tem valor estimado');
  end if;

  if v_services > 1 then
    v_score := v_score + least((v_services - 1) * 2, 6);
    v_reasons := array_append(v_reasons, format('Interesse em %s serviços', v_services));
  end if;

  if nullif(btrim(coalesce(l.approach_angle, '')), '') is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Ângulo de abordagem definido');
  end if;

  return query select least(v_score, 100), v_reasons;
end
$function$;
