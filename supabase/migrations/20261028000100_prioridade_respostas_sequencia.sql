-- =============================================================================
-- Prioridade dos leads, deteção de respostas e sequência de follow-ups
--  1. leads.score (0–100) e leads.score_reasons: calculados sempre que o lead
--     muda (trigger), para ordenar a lista e mostrar "os mais quentes".
--  2. mail_accounts: leitura da caixa de entrada (IMAP) para detetar respostas;
--     nova atividade "email_received".
--  3. leads.follow_up_count e a função vnd_after_email_sent: depois de cada email
--     enviado pela plataforma, agenda o passo seguinte da sequência.
-- =============================================================================

alter type public.activity_type add value if not exists 'email_received';

-- -----------------------------------------------------------------------------
-- 1. Prioridade
-- -----------------------------------------------------------------------------
alter table public.leads
  add column score smallint not null default 0 check (score between 0 and 100),
  add column score_reasons text[] not null default '{}',
  add column follow_up_count smallint not null default 0 check (follow_up_count between 0 and 50);

create index leads_score_idx on public.leads (workspace_id, score desc)
  where archived_at is null and anonymized_at is null;

/**
 * Pontuação de um lead (quanto maior, mais vale a pena contactar agora) e as
 * razões, em português, para mostrar na plataforma.
 */
create or replace function public.vnd_lead_score(l public.leads)
returns table (score integer, reasons text[])
language plpgsql stable
set search_path = ''
as $$
declare
  v_score integer := 0;
  v_reasons text[] := '{}';
  v_rank integer;
  v_web boolean;
  v_social boolean;
begin
  if l.status in ('cliente', 'sem_interesse', 'em_pausa') or l.archived_at is not null or l.anonymized_at is not null then
    return query select 0, '{}'::text[];
    return;
  end if;

  -- Fase do pipeline: quem já respondeu está mais perto de fechar.
  case l.status
    when 'reuniao' then v_score := v_score + 30; v_reasons := array_append(v_reasons, 'Reunião marcada');
    when 'respondeu' then v_score := v_score + 25; v_reasons := array_append(v_reasons, 'Respondeu');
    when 'proposta_enviada' then v_score := v_score + 20; v_reasons := array_append(v_reasons, 'Proposta enviada');
    else null;
  end case;

  -- O site só conta se o lead precisa de web design (ou ainda não tem serviços).
  v_web := cardinality(l.services) = 0 or exists (
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
      if l.pagespeed is not null and l.pagespeed < 50 then
        v_score := v_score + 15; v_reasons := array_append(v_reasons, format('Site lento (PageSpeed %s)', l.pagespeed));
      elsif l.pagespeed is not null and l.pagespeed < 70 then
        v_score := v_score + 8; v_reasons := array_append(v_reasons, format('Site pouco rápido (PageSpeed %s)', l.pagespeed));
      end if;
      if l.mobile = 'nao' then
        v_score := v_score + 15; v_reasons := array_append(v_reasons, 'Site não funciona no telemóvel');
      elsif l.mobile = 'parcial' then
        v_score := v_score + 7; v_reasons := array_append(v_reasons, 'Site parcialmente adaptado ao telemóvel');
      end if;
    end if;
  end if;

  if nullif(btrim(coalesce(l.problems, '')), '') is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Problemas identificados');
  end if;

  if l.email is not null then
    v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Tem email');
  elsif l.phone is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Tem telefone');
  end if;

  if l.sector_id is not null then
    select s.priority_rank into v_rank from public.sectors s where s.id = l.sector_id;
    if v_rank between 1 and 3 then
      v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Setor prioritário');
    elsif v_rank between 4 and 6 then
      v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Setor com boas oportunidades');
    end if;
  end if;

  if l.estimated_value >= 1000 then
    v_score := v_score + 10; v_reasons := array_append(v_reasons, 'Valor estimado ≥ 1000 €');
  elsif l.estimated_value > 0 then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Tem valor estimado');
  end if;

  if nullif(btrim(coalesce(l.approach_angle, '')), '') is not null then
    v_score := v_score + 5; v_reasons := array_append(v_reasons, 'Ângulo de abordagem definido');
  end if;

  return query select least(v_score, 100), v_reasons;
end
$$;

create or replace function public.vnd_leads_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select s.score, s.reasons into new.score, new.score_reasons from public.vnd_lead_score(new) s;
  return new;
end
$$;

-- "leads_score" corre depois dos outros BEFORE (ordem alfabética): vê o estado final.
create trigger leads_score before insert or update on public.leads
  for each row execute function public.vnd_leads_score();

-- Linha do tempo: a pontuação e o contador de follow-ups não são "edições" do lead
-- (o resto igual à versão de 20261015000100_arquivar_leads.sql).
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
       'score', 'score_reasons', 'follow_up_count',
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

-- Pontuação dos leads que já existem (sem mexer em "atualizado em" nem na linha do tempo).
alter table public.leads disable trigger user;
update public.leads l set (score, score_reasons) = (select s.score, s.reasons from public.vnd_lead_score(l) s);
alter table public.leads enable trigger user;

-- -----------------------------------------------------------------------------
-- 2. Respostas: leitura da caixa de entrada (IMAP)
-- -----------------------------------------------------------------------------
alter table public.mail_accounts
  add column reply_detection boolean not null default true,
  -- Só no "Outro (SMTP)"; null = o servidor SMTP com "imap." em vez de "smtp.".
  add column imap_host text check (imap_host is null or length(btrim(imap_host)) between 1 and 253),
  add column imap_port integer check (imap_port is null or imap_port between 1 and 65535),
  -- Até onde já foi lida a caixa de entrada (UID) e a "validade" desses UID.
  add column imap_uid_validity bigint,
  add column imap_last_uid bigint,
  add column imap_checked_at timestamptz,
  add column imap_error text check (imap_error is null or length(imap_error) <= 1000);

-- Para não registar a mesma resposta duas vezes.
-- (sem "type = 'email_received'" no filtro: um valor novo do enum não se pode usar na mesma migração)
create index lead_activities_message_id_idx on public.lead_activities (workspace_id, ((payload ->> 'message_id')))
  where payload ? 'message_id';

-- -----------------------------------------------------------------------------
-- 3. Sequência de follow-ups: depois de um email enviado pela plataforma
-- -----------------------------------------------------------------------------
/**
 * p_first: primeiro contacto (Identificado → Contactado); senão, um follow-up
 * feito (conta mais um). Agenda o passo seguinte (p_next_on, p_next_text)
 * calculado pelo servidor a partir de Definições → Follow-up e lembretes.
 */
create or replace function public.vnd_after_email_sent(
  p_lead_id uuid,
  p_first boolean,
  p_next_on date,
  p_next_text text,
  p_follow_up_count integer,
  p_step integer default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_today date;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado' using errcode = 'P0002';
  end if;
  v_today := (now() at time zone coalesce(
    (select w.settings ->> 'timezone' from public.workspaces w where w.id = v_lead.workspace_id), 'Europe/Lisbon'))::date;

  if p_first then
    -- A regra de estado regista "Estado alterado" e "Follow-up agendado".
    update public.leads
       set status = 'contactado',
           channel = coalesce(channel, 'email'),
           next_action_on = p_next_on,
           next_action_text = p_next_text,
           follow_up_count = 0
     where id = p_lead_id;
    return;
  end if;

  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads
     set last_follow_up_on = v_today,
         next_action_on = p_next_on,
         next_action_text = p_next_text,
         follow_up_count = least(p_follow_up_count, 50)
   where id = p_lead_id;
  perform set_config('vnd.skip_update_log', '', true);

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (v_lead.workspace_id, p_lead_id, 'follow_up_done',
          jsonb_strip_nulls(jsonb_build_object(
            'on', p_next_on, 'text', p_next_text, 'previous_on', v_lead.next_action_on,
            'sequence_step', p_step, 'via', 'email')),
          public.vnd_actor_user_id(), public.vnd_actor_token_id());
end
$$;
grant execute on function public.vnd_after_email_sent(uuid, boolean, date, text, integer, integer) to authenticated;
