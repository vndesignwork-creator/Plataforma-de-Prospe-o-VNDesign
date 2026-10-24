-- Dias úteis: os follow-ups que a plataforma marca sozinha ("Contactado", "Não
-- atendeu", "Mais tarde", follow-up feito, "agora não" que volta) deixam de cair
-- ao sábado e ao domingo e passam para segunda-feira. Quem trabalha ao fim de
-- semana liga-o em Definições (settings.work_weekends). As datas escolhidas à mão
-- (ficha, Agenda) ficam como estão.

create or replace function public.vnd_working_day(p_settings jsonb, p_date date)
returns date
language sql immutable
set search_path = ''
as $$
  select case
    when p_date is null then null
    when coalesce((p_settings ->> 'work_weekends')::boolean, false) then p_date
    when extract(isodow from p_date) = 6 then p_date + 2
    when extract(isodow from p_date) = 7 then p_date + 1
    else p_date
  end
$$;
grant execute on function public.vnd_working_day(jsonb, date) to authenticated, service_role;

create or replace function public.vnd_leads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_today date;
  v_follow_up_days integer;
  v_imported boolean := coalesce(current_setting('vnd.source', true), '') = 'import';
begin
  -- Nomes com quebras de linha (vindos da folha) passam a uma só linha.
  new.company_name := btrim(regexp_replace(new.company_name, '\s+', ' ', 'g'));
  new.company_name_normalized := coalesce(public.vnd_normalize_company(new.company_name), '');
  new.website_key := public.vnd_website_key(new.website);
  new.email_normalized := public.vnd_normalize_email(new.email);
  new.email_domain := public.vnd_email_business_domain(new.email_normalized);
  new.search_text := coalesce(public.vnd_normalize_text(concat_ws(' ',
    new.company_name, new.city, new.contact_name, new.email, new.website,
    new.phone, new.problems, new.notes, new.approach_angle)), '');

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    -- Morada nova = localização antiga deixa de valer (a não ser que o ponto
    -- tenha sido posto à mão, ou que esta mesma gravação traga coordenadas novas).
    if (new.address is distinct from old.address or new.city is distinct from old.city)
       and coalesce(old.geocode_status, '') <> 'manual'
       and new.latitude is not distinct from old.latitude
       and new.longitude is not distinct from old.longitude then
      new.latitude := null;
      new.longitude := null;
      new.geocode_status := null;
      new.geocoded_at := null;
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if tg_op = 'UPDATE' then
      new.status_changed_at := now();
    end if;

    select w.settings into v_settings from public.workspaces w where w.id = new.workspace_id;
    v_today := (now() at time zone coalesce(v_settings ->> 'timezone', 'Europe/Lisbon'))::date;
    v_follow_up_days := coalesce((v_settings ->> 'follow_up_days')::integer, 3);

    if new.status = 'contactado' then
      -- Numa importação não se inventam datas de contacto (a folha pode não as ter),
      -- mas o follow-up fica agendado para não cair no esquecimento.
      if not (tg_op = 'INSERT' and v_imported) then
        new.first_contact_on := coalesce(new.first_contact_on, v_today);
        if tg_op = 'INSERT' then
          new.last_follow_up_on := coalesce(new.last_follow_up_on, v_today);
        elsif new.last_follow_up_on is not distinct from old.last_follow_up_on then
          new.last_follow_up_on := v_today;
        end if;
      end if;
      -- Agenda o follow-up se não houver próxima ação futura.
      if new.next_action_on is null or new.next_action_on <= v_today then
        -- Sem fins de semana (a não ser que se trabalhe ao fim de semana): sábado e domingo passam para segunda.
        new.next_action_on := public.vnd_working_day(v_settings, v_today + v_follow_up_days);
        new.next_action_text := 'Enviar follow-up';
      end if;
    elsif new.status in ('cliente', 'sem_interesse') then
      new.next_action_text := null;
      new.next_action_on := null;
    end if;
  end if;

  return new;
end
$$;

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
  -- Adiar ou agendar nunca cai ao sábado nem ao domingo (passa para segunda), a não ser que se trabalhe ao fim de semana.
  v_next := case when v_days is null then null else public.vnd_working_day(v_settings, v_today + v_days) end;

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

create or replace function public.retry_lost_leads(p_dry_run boolean default false)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_lead record;
  v_count integer := 0;
begin
  for v_lead in
    select id, workspace_id, status_changed_at
      from public.leads
     where status = 'sem_interesse' and retry_on is not null and retry_on <= v_today and anonymized_at is null
  loop
    v_count := v_count + 1;
    if p_dry_run then
      continue;
    end if;
    perform set_config('vnd.retry', '1', true);
    update public.leads set status = 'contactado', archived_at = null where id = v_lead.id;
    perform set_config('vnd.retry', '', true);
    -- A regra do estado marca o follow-up para daqui a uns dias: volta a ser hoje.
    perform set_config('vnd.skip_update_log', '1', true);
    update public.leads
       set next_action_on = public.vnd_working_day((select w.settings from public.workspaces w where w.id = v_lead.workspace_id), v_today),
           next_action_text = 'Voltar a tentar (tinha dito “agora não”)'
     where id = v_lead.id;
    perform set_config('vnd.skip_update_log', '', true);
    insert into public.lead_activities (workspace_id, lead_id, type, body, payload)
    values (v_lead.workspace_id, v_lead.id, 'note',
            'Voltou à prospeção: a ' || to_char((v_lead.status_changed_at at time zone 'Europe/Lisbon')::date, 'DD/MM/YYYY') || ' tinha dito “agora não”.',
            jsonb_build_object('via', 'retry'));
  end loop;
  return v_count;
end
$$;
revoke execute on function public.retry_lost_leads(boolean) from public, anon, authenticated;
