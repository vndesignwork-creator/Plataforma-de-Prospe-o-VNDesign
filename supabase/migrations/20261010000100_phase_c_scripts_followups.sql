-- =============================================================================
-- VNDesign Leads — Fase C: scripts de contacto, assinatura e lembretes
-- =============================================================================

alter type public.activity_type add value if not exists 'follow_up_done';

-- -----------------------------------------------------------------------------
-- Definições: resumo diário por email (desligado por omissão)
-- -----------------------------------------------------------------------------
alter table public.workspaces alter column settings set default jsonb_build_object(
  'timezone', 'Europe/Lisbon',
  'currency', 'EUR',
  'follow_up_days', 3,
  'opt_out_line', 'Se não quiser receber mais contactos, basta responder a este email.',
  'daily_digest', jsonb_build_object('enabled', false, 'recipient', null)
);
update public.workspaces
   set settings = settings || jsonb_build_object('daily_digest', jsonb_build_object('enabled', false, 'recipient', null))
 where not settings ? 'daily_digest';

-- -----------------------------------------------------------------------------
-- Linha do tempo com menos ruído (substitui a versão da Fase A)
-- -----------------------------------------------------------------------------
create or replace function public.vnd_leads_log_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_token uuid := nullif(current_setting('vnd.actor_token_id', true), '')::uuid;
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
       'status', 'updated_at', 'status_changed_at', 'kanban_position', 'number',
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
-- Follow-up feito / adiar
--   done   → último follow-up = hoje; nova próxima ação a +p_days (ou nenhuma)
--   snooze → próxima ação passa para hoje + p_days (por omissão, follow_up_days)
-- -----------------------------------------------------------------------------
create or replace function public.complete_follow_up(
  p_lead_id uuid,
  p_action text,
  p_days integer default null,
  p_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_settings jsonb;
  v_today date;
  v_days integer;
  v_next date;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lead não encontrado.';
  end if;
  if p_action not in ('done', 'snooze') then
    raise exception using errcode = '22023', message = 'Ação inválida (done ou snooze).';
  end if;

  select w.settings into v_settings from public.workspaces w where w.id = v_lead.workspace_id;
  v_today := (now() at time zone coalesce(v_settings ->> 'timezone', 'Europe/Lisbon'))::date;
  v_days := coalesce(p_days, case when p_action = 'snooze' then coalesce((v_settings ->> 'follow_up_days')::integer, 3) end);
  v_next := case when v_days is null then null else v_today + v_days end;

  perform set_config('vnd.skip_update_log', '1', true);
  if p_action = 'done' then
    update public.leads set
      last_follow_up_on = v_today,
      next_action_on = v_next,
      -- A ação anterior ficou feita: a próxima é um novo follow-up.
      next_action_text = case when v_next is null then null else 'Enviar follow-up' end
    where id = p_lead_id;
  else
    update public.leads set
      next_action_on = v_next,
      next_action_text = coalesce(nullif(btrim(next_action_text), ''), 'Enviar follow-up')
    where id = p_lead_id;
  end if;
  perform set_config('vnd.skip_update_log', '0', true);

  insert into public.lead_activities (workspace_id, lead_id, type, body, payload, actor_user_id, actor_token_id)
  values (
    v_lead.workspace_id, p_lead_id,
    case when p_action = 'done' then 'follow_up_done' else 'follow_up_scheduled' end::public.activity_type,
    nullif(btrim(coalesce(p_note, '')), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'on', v_next,
      'text', case when v_next is null then null
                   when p_action = 'done' then 'Enviar follow-up'
                   else coalesce(nullif(btrim(v_lead.next_action_text), ''), 'Enviar follow-up') end,
      'done_text', case when p_action = 'done' then v_lead.next_action_text end,
      'snoozed', case when p_action = 'snooze' then true end,
      'previous_on', v_lead.next_action_on
    )),
    auth.uid(),
    nullif(current_setting('vnd.actor_token_id', true), '')::uuid
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Resumo diário: workspaces com o resumo ativo e o destinatário (por omissão,
-- o email do dono). Só para o servidor (chave de serviço).
-- -----------------------------------------------------------------------------
create or replace function public.digest_recipients()
returns table (workspace_id uuid, workspace_name text, recipient text, timezone text)
language sql stable security definer
set search_path = ''
as $$
  select w.id, w.name,
         coalesce(nullif(w.settings -> 'daily_digest' ->> 'recipient', ''), u.email),
         coalesce(w.settings ->> 'timezone', 'Europe/Lisbon')
    from public.workspaces w
    join lateral (
      select m.user_id from public.workspace_members m
       where m.workspace_id = w.id and m.role = 'owner'
       order by m.created_at limit 1
    ) o on true
    join auth.users u on u.id = o.user_id
   where (w.settings -> 'daily_digest' ->> 'enabled')::boolean is true
$$;

revoke execute on function public.complete_follow_up(uuid, text, integer, text) from public, anon;
grant execute on function public.complete_follow_up(uuid, text, integer, text) to authenticated, service_role;
revoke execute on function public.digest_recipients() from public, anon, authenticated;
grant execute on function public.digest_recipients() to service_role;
