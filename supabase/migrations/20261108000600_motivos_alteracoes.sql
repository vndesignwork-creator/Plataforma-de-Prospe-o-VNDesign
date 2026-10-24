-- =============================================================================
-- 107. Motivo de "Sem interesse" (preço, já tem site, agora não, não responde,
--      outro): para perceber porque se perdem leads (Estatísticas, filtro).
--      Sai sozinho quando o lead deixa de estar em "Sem interesse".
-- 112. "Lead editado" passa a guardar o valor de antes e o de depois de cada
--      campo, para ver o que mudou na linha do tempo e repor o valor antigo.
-- =============================================================================

alter table public.leads
  add column if not exists lost_reason text
    constraint leads_lost_reason_check check (lost_reason is null or lost_reason in ('preco', 'ja_tem_site', 'agora_nao', 'nao_responde', 'outro'));

create or replace function public.vnd_leads_clear_lost_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'sem_interesse' then
    new.lost_reason := null;
  end if;
  return new;
end
$$;
create trigger leads_clear_lost_reason before insert or update of status, lost_reason on public.leads
  for each row execute function public.vnd_leads_clear_lost_reason();

-- Quantos leads em "Sem interesse" por motivo (null = sem motivo).
create or replace function public.lead_lost_reason_counts(p_workspace_id uuid)
returns table (reason text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.lost_reason, count(*)::bigint
    from public.leads l
   where l.workspace_id = p_workspace_id
     and l.status = 'sem_interesse'
     and l.anonymized_at is null
   group by l.lost_reason
   order by count(*) desc
$$;
grant execute on function public.lead_lost_reason_counts(uuid) to authenticated;

-- Valor guardado no registo de alterações: textos compridos não se guardam
-- inteiros (ficam {"long": true} e não se podem repor a partir daqui).
create or replace function public.vnd_change_value(v jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or v = 'null'::jsonb then 'null'::jsonb
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 500 then jsonb_build_object('long', true)
    when jsonb_typeof(v) in ('object', 'array') and length(v::text) > 2000 then jsonb_build_object('long', true)
    else v
  end
$$;

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

  -- O motivo de "Sem interesse" escolhido ao mudar o estado já vai no "status_changed".
  if new.status is distinct from old.status then
    v_fields := array_remove(v_fields, 'lost_reason');
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
