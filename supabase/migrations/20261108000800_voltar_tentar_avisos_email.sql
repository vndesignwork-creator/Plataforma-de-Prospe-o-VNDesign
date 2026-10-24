-- =============================================================================
-- 124. "Agora não" volta sozinho: leads.retry_on (data em que o lead em
--      "Sem interesse" volta à prospeção). O cron diário chama
--      retry_lost_leads(): passa-o a "Contactado" com a próxima ação para hoje
--      (e tira-o do arquivo). Sai sozinho se o lead deixar "Sem interesse".
-- 128. Avisos por email: notifications.emailed_at (cada aviso vai uma vez).
-- 130. A pesquisa rápida (Ctrl+K) também encontra os comentários da equipa.
-- =============================================================================

alter table public.leads add column if not exists retry_on date;
create index if not exists leads_retry_idx on public.leads (retry_on) where retry_on is not null;

-- O motivo e a data de voltar a tentar só existem em "Sem interesse".
create or replace function public.vnd_leads_clear_lost_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'sem_interesse' then
    new.lost_reason := null;
    new.retry_on := null;
  end if;
  return new;
end
$$;
drop trigger if exists leads_clear_lost_reason on public.leads;
create trigger leads_clear_lost_reason before insert or update of status, lost_reason, retry_on on public.leads
  for each row execute function public.vnd_leads_clear_lost_reason();

-- Os leads com a data de voltar a tentar já chegada voltam à prospeção (cron diário).
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
       set next_action_on = v_today, next_action_text = 'Voltar a tentar (tinha dito “agora não”)'
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

-- Linha do tempo: igual à de 20261108000600, mas sem "Follow-up agendado" ao voltar à
-- prospeção e sem "Lead editado" pela data de voltar a tentar que sai com a mudança de estado.
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
  v_changes jsonb;
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
            jsonb_strip_nulls(jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.lost_reason)), v_actor, v_token);

    -- Ao voltar à prospeção (retry_lost_leads), a próxima ação passa logo a hoje: sem "Follow-up agendado".
    if new.status = 'contactado' and new.next_action_on is distinct from old.next_action_on
       and new.next_action_on is not null
       and coalesce(current_setting('vnd.retry', true), '') <> '1' then
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

  -- O motivo de "Sem interesse" (e a data de voltar a tentar) escolhidos ao mudar o estado já vão no "status_changed".
  if new.status is distinct from old.status then
    v_fields := array_remove(array_remove(v_fields, 'lost_reason'), 'retry_on');
  end if;

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
    -- O valor de antes e o de depois de cada campo (para ver o que mudou e repor).
    select jsonb_object_agg(k, jsonb_build_object(
             'from', public.vnd_change_value(to_jsonb(old) -> k),
             'to', public.vnd_change_value(to_jsonb(new) -> k)))
      into v_changes
      from unnest(v_fields) k;
    insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
    values (new.workspace_id, new.id, 'updated',
            jsonb_build_object('fields', to_jsonb(v_fields), 'changes', coalesce(v_changes, '{}'::jsonb)), v_actor, v_token);
  end if;

  return new;
end
$$;


-- Avisos por email: cada aviso vai no máximo uma vez.
alter table public.notifications add column if not exists emailed_at timestamptz;

-- Pesquisa rápida: notas, chamadas e comentários da equipa.
drop index if exists public.lead_activities_notes_search_idx;
create index if not exists lead_activities_notes_search_idx
  on public.lead_activities using gin (public.vnd_normalize_text(body) extensions.gin_trgm_ops)
  where type in ('note', 'call_logged', 'comment');

create or replace function public.search_lead_notes(p_workspace_id uuid, p_q text, p_limit integer default 6)
returns table (
  id uuid,
  type text,
  body text,
  created_at timestamptz,
  lead_id uuid,
  lead_number integer,
  company_name text,
  project_title text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.type::text, a.body, a.created_at, l.id, l.number, l.company_name, l.project_title
    from public.lead_activities a
    join public.leads l on l.id = a.lead_id
   where a.workspace_id = p_workspace_id
     and a.type in ('note', 'call_logged', 'comment')
     and public.vnd_normalize_text(a.body) like '%' || replace(replace(replace(public.vnd_normalize_text(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     and l.archived_at is null
     and l.anonymized_at is null
   order by a.created_at desc
   limit least(greatest(coalesce(p_limit, 6), 1), 20)
$$;
grant execute on function public.search_lead_notes(uuid, text, integer) to authenticated;
