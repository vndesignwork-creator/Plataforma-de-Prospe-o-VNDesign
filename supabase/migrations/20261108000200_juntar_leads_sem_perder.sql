-- =============================================================================
-- Juntar leads sem perder nada. Antes só passavam para o principal a linha do
-- tempo, as propostas, as análises e as tarefas: pagamentos, reuniões, horas,
-- entregas, despesas, contratos, revisões, colaboradores, acessos, kit da marca,
-- kit GEO, "Aparece nas IAs?" e o projeto do duplicado eram apagados em cascata.
-- Também guarda o nome do projeto e o responsável escolhidos, junta as etiquetas
-- e repõe os outros projetos do mesmo cliente (client_of).
-- =============================================================================

create or replace function public.merge_leads(
  p_primary_id uuid,
  p_duplicate_ids uuid[],
  p_values jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_primary public.leads;
  v_numbers integer[];
  v_found integer;
  v_values jsonb;
  v_dup_services text[];
  v_dup_tags text[];
begin
  -- Sem duplicados = juntar dados de um registo novo (rascunho) ao lead existente.
  p_duplicate_ids := coalesce(p_duplicate_ids, '{}');
  if p_primary_id = any(p_duplicate_ids) then
    raise exception using errcode = '22023', message = 'O lead principal não pode estar na lista de duplicados.';
  end if;

  select * into v_primary from public.leads where id = p_primary_id for update;
  if not found or not public.vnd_can_write(v_primary.workspace_id) then
    raise exception using errcode = 'P0002', message = 'Lead principal não encontrado.';
  end if;

  select count(*), array_agg(l.number order by l.number)
    into v_found, v_numbers
    from public.leads l
   where l.id = any(p_duplicate_ids) and l.workspace_id = v_primary.workspace_id;
  if v_found <> cardinality(p_duplicate_ids) then
    raise exception using errcode = 'P0002', message = 'Um ou mais leads a juntar não foram encontrados.';
  end if;

  -- Só campos editáveis podem ser escolhidos.
  v_values := coalesce(p_values, '{}'::jsonb) - array[
    'id', 'workspace_id', 'number', 'created_at', 'created_by', 'updated_at', 'status_changed_at',
    'anonymized_at', 'company_name_normalized', 'website_key', 'email_normalized', 'email_domain',
    'search_text', 'kanban_position'
  ];
  v_primary := jsonb_populate_record(v_primary, v_values);

  select array_agg(distinct s) into v_dup_services
    from public.leads l, unnest(l.services) s
   where l.id = any(p_duplicate_ids);
  select array_agg(distinct t) into v_dup_tags
    from public.leads l, unnest(l.tags) t
   where l.id = any(p_duplicate_ids);

  -- Move tudo o que pertence aos duplicados antes de os apagar (o resto seria
  -- apagado em cascata: pagamentos, reuniões, horas, entregas, contratos…).
  update public.lead_activities set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.proposals set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.site_audits set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.lead_tasks set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.lead_payments set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.lead_meetings set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.project_revisions set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.project_time_entries set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.project_deliverables set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.project_expenses set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.lead_contracts set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.email_tracking set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.lead_accesses set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.ai_visibility_checks set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.pomodoro_timers set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  -- Colaboradores: os que ainda não estão no principal (o mesmo email só uma vez).
  update public.project_collaborators c set lead_id = p_primary_id
   where c.lead_id = any(p_duplicate_ids)
     and not exists (select 1 from public.project_collaborators p where p.lead_id = p_primary_id and p.email = c.email);
  -- Um por lead (projeto, briefing, kit da marca, kit GEO, sequência): passa o do
  -- duplicado só se o principal ainda não tiver.
  if not exists (select 1 from public.lead_projects where lead_id = p_primary_id) then
    update public.lead_projects set lead_id = p_primary_id
     where lead_id = (select lead_id from public.lead_projects where lead_id = any(p_duplicate_ids) order by updated_at desc limit 1);
  end if;
  if not exists (select 1 from public.project_briefings where lead_id = p_primary_id) then
    update public.project_briefings set lead_id = p_primary_id
     where id = (select id from public.project_briefings where lead_id = any(p_duplicate_ids) order by created_at desc limit 1);
  end if;
  if not exists (select 1 from public.lead_brand_kits where lead_id = p_primary_id) then
    update public.lead_brand_kits set lead_id = p_primary_id
     where lead_id = (select lead_id from public.lead_brand_kits where lead_id = any(p_duplicate_ids) limit 1);
  end if;
  if not exists (select 1 from public.lead_geo where lead_id = p_primary_id) then
    update public.lead_geo set lead_id = p_primary_id
     where lead_id = (select lead_id from public.lead_geo where lead_id = any(p_duplicate_ids) order by updated_at desc limit 1);
  end if;
  if not exists (select 1 from public.lead_sequence_state where lead_id = p_primary_id) then
    update public.lead_sequence_state set lead_id = p_primary_id
     where lead_id = (select lead_id from public.lead_sequence_state where lead_id = any(p_duplicate_ids) order by updated_at desc limit 1);
  end if;
  -- Outros projetos do mesmo cliente passam a apontar para o principal.
  update public.leads set client_of = p_primary_id where client_of = any(p_duplicate_ids) and id <> p_primary_id;
  if v_primary.client_of = any(p_duplicate_ids) then
    v_primary.client_of := null;
  end if;
  delete from public.leads where id = any(p_duplicate_ids);

  -- A junção já fica registada como "merged": sem um "Lead editado" repetido.
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads set
    company_name = v_primary.company_name,
    sector_id = v_primary.sector_id,
    website = v_primary.website,
    city = v_primary.city,
    address = v_primary.address,
    latitude = v_primary.latitude,
    longitude = v_primary.longitude,
    problems = v_primary.problems,
    pagespeed = v_primary.pagespeed,
    mobile = v_primary.mobile,
    email = v_primary.email,
    phone = v_primary.phone,
    contact_name = v_primary.contact_name,
    status = v_primary.status,
    channel = v_primary.channel,
    first_contact_on = v_primary.first_contact_on,
    last_follow_up_on = v_primary.last_follow_up_on,
    next_action_text = v_primary.next_action_text,
    next_action_on = v_primary.next_action_on,
    estimated_value = v_primary.estimated_value,
    notes = v_primary.notes,
    approach_angle = v_primary.approach_angle,
    source_url = v_primary.source_url,
    suggested_on = v_primary.suggested_on,
    email_subject = v_primary.email_subject,
    email_body = v_primary.email_body,
    project_title = v_primary.project_title,
    assigned_to = v_primary.assigned_to,
    client_of = v_primary.client_of,
    -- Etiquetas: as escolhidas, mais as dos duplicados.
    tags = (
      select coalesce(array_agg(distinct t order by t), '{}')
        from unnest(v_primary.tags || coalesce(v_dup_tags, '{}')) t
    )[1:10],
    -- Serviços: os escolhidos, mais os dos duplicados (nada se perde).
    services = (
      select coalesce(array_agg(distinct s order by s), '{}')
        from unnest(v_primary.services || coalesce(v_dup_services, '{}')) s
    )
  where id = p_primary_id;
  perform set_config('vnd.skip_update_log', '', true);

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (
    v_primary.workspace_id, p_primary_id, 'merged',
    jsonb_build_object(
      'merged_numbers', coalesce(to_jsonb(v_numbers), '[]'::jsonb),
      'fields', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(v_values) k), '[]'::jsonb)
    ),
    public.vnd_actor_user_id(),
    public.vnd_actor_token_id()
  );

  return p_primary_id;
end
$$;
