-- "Feito" (✓ no cartão Hoje, menu da próxima ação na ficha) num lead ainda em
-- "Identificado" quer dizer que o primeiro contacto foi feito: o lead passa a
-- "Contactado" (com a data do 1.º contacto) e a próxima ação é o follow-up.
-- Antes ficava em "Identificado" com um "último follow-up" marcado.

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
  -- Um lead ainda não contactado não tem follow-up: a próxima ação é o primeiro contacto.
  v_default text;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lead não encontrado.';
  end if;
  if p_action not in ('done', 'snooze') then
    raise exception using errcode = '22023', message = 'Ação inválida (done ou snooze).';
  end if;

  v_default := case when v_lead.status = 'identificado' then 'Primeiro contacto' else 'Enviar follow-up' end;

  select w.settings into v_settings from public.workspaces w where w.id = v_lead.workspace_id;
  v_today := (now() at time zone coalesce(v_settings ->> 'timezone', 'Europe/Lisbon'))::date;
  v_days := coalesce(p_days, case when p_action = 'snooze' then coalesce((v_settings ->> 'follow_up_days')::integer, 3) end);
  -- Adiar ou agendar nunca cai ao sábado nem ao domingo (passa para segunda), a não ser que se trabalhe ao fim de semana.
  v_next := case when v_days is null then null else public.vnd_working_day(v_settings, v_today + v_days) end;

  perform set_config('vnd.skip_update_log', '1', true);
  if p_action = 'done' then
    update public.leads set
      -- Feito num lead ainda não contactado = foi o primeiro contacto: passa a Contactado.
      status = case when status = 'identificado' then 'contactado'::public.lead_status else status end,
      last_follow_up_on = v_today,
      next_action_on = v_next,
      -- A ação anterior ficou feita: a próxima é um novo follow-up.
      next_action_text = case when v_next is null then null else 'Enviar follow-up' end
    where id = p_lead_id;
  else
    update public.leads set
      next_action_on = v_next,
      next_action_text = coalesce(nullif(btrim(next_action_text), ''), v_default)
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
                   else coalesce(nullif(btrim(v_lead.next_action_text), ''), v_default) end,
      'done_text', case when p_action = 'done' then v_lead.next_action_text end,
      'snoozed', case when p_action = 'snooze' then true end,
      'previous_on', v_lead.next_action_on
    )),
    auth.uid(),
    nullif(current_setting('vnd.actor_token_id', true), '')::uuid
  );
end
$$;
