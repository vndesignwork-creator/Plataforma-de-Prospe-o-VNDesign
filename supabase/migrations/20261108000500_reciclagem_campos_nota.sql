-- =============================================================================
-- Organizar (99–106):
--  1. Nota afixada no topo da ficha (leads.pinned_note).
--  2. Campos personalizados: definições por workspace (custom_fields) e os
--     valores de cada lead (leads.custom, { chave: valor }).
--  3. Reciclagem: apagar um lead guarda uma cópia completa (com tarefas,
--     pagamentos, reuniões, horas, propostas, linha do tempo…) durante 30 dias;
--     "Repor" volta a pô-lo como estava. Anonimizar (RGPD) continua definitivo.
--  4. Juntar leads passa também os campos personalizados e a nota afixada.
-- =============================================================================

-- 1. Nota afixada -------------------------------------------------------------
alter table public.leads
  add column if not exists pinned_note text
    constraint leads_pinned_note_check check (pinned_note is null or length(pinned_note) between 1 and 200);

-- 2. Campos personalizados ------------------------------------------------------
alter table public.leads
  add column if not exists custom jsonb not null default '{}'::jsonb
    constraint leads_custom_check check (jsonb_typeof(custom) = 'object');

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Chave curta e estável usada em leads.custom (o nome pode mudar).
  key text not null check (key ~ '^f[a-z0-9]{6,12}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  type text not null check (type in ('text', 'number', 'yes_no', 'choice')),
  options text[] not null default '{}' check (cardinality(options) <= 30),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create index custom_fields_workspace_idx on public.custom_fields (workspace_id, sort_order);

alter table public.custom_fields enable row level security;
create policy custom_fields_member_select on public.custom_fields for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Criar, mudar e apagar campos: só o dono ou um administrador.
create policy custom_fields_staff_write on public.custom_fields for all to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

-- Apagar um campo tira o valor de todos os leads (sem "Lead editado" em cada um).
create or replace function public.custom_field_drop_values(p_workspace_id uuid, p_key text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads set custom = custom - p_key where workspace_id = p_workspace_id and custom ? p_key;
  get diagnostics v_count = row_count;
  perform set_config('vnd.skip_update_log', '', true);
  return v_count;
end
$$;
grant execute on function public.custom_field_drop_values(uuid, text) to authenticated;

-- 3. Reciclagem -----------------------------------------------------------------
create table public.lead_trash (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid not null,
  number integer not null,
  company_name text not null,
  status text not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references auth.users (id) on delete set null,
  -- { lead: {...}, children: { tabela: [linhas] }, client_of_children: [ids] }
  snapshot jsonb not null
);
create index lead_trash_workspace_idx on public.lead_trash (workspace_id, deleted_at desc);

alter table public.lead_trash enable row level security;
-- Tem tudo do lead (pagamentos, acessos…): só o dono ou um administrador vê e
-- apaga de vez. Só trash_leads() lá põe cópias (ninguém escreve snapshots à mão).
create policy lead_trash_staff_select on public.lead_trash for select to authenticated
  using (public.is_workspace_staff(workspace_id));
create policy lead_trash_staff_delete on public.lead_trash for delete to authenticated
  using (public.is_workspace_staff(workspace_id));

/** Tabelas com dados de um lead, pela ordem em que se repõem (as referenciadas primeiro). */
create or replace function public.vnd_lead_child_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'site_audits', 'proposals', 'lead_tasks', 'lead_payments', 'lead_meetings', 'lead_projects',
    'project_revisions', 'project_time_entries', 'project_deliverables', 'lead_contracts',
    'project_briefings', 'project_expenses', 'email_tracking', 'project_collaborators',
    'lead_brand_kits', 'lead_accesses', 'ai_visibility_checks', 'lead_geo', 'lead_sequence_state',
    'lead_activities'
  ]
$$;

/**
 * Apaga leads guardando uma cópia completa na reciclagem. Devolve quantos.
 * (Os temporizadores do Pomodoro e os "não são duplicados" não se guardam.)
 */
create or replace function public.trash_leads(p_workspace_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_children jsonb;
  v_rows jsonb;
  v_table text;
  v_count integer := 0;
begin
  if not public.is_workspace_staff(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Só o dono ou um administrador pode apagar leads.';
  end if;
  for v_lead in
    select * from public.leads where workspace_id = p_workspace_id and id = any(p_ids) for update
  loop
    v_children := '{}'::jsonb;
    foreach v_table in array public.vnd_lead_child_tables() loop
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.lead_id = $1', v_table)
        into v_rows using v_lead.id;
      if jsonb_array_length(v_rows) > 0 then
        v_children := v_children || jsonb_build_object(v_table, v_rows);
      end if;
    end loop;
    insert into public.lead_trash (workspace_id, lead_id, number, company_name, status, deleted_by, snapshot)
    values (
      p_workspace_id, v_lead.id, v_lead.number, v_lead.company_name, v_lead.status::text, auth.uid(),
      jsonb_build_object(
        'lead', to_jsonb(v_lead),
        'children', v_children,
        'client_of_children', coalesce((select jsonb_agg(c.id) from public.leads c where c.client_of = v_lead.id), '[]'::jsonb)
      )
    );
    delete from public.leads where id = v_lead.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;
grant execute on function public.trash_leads(uuid, uuid[]) to authenticated;

/** Repõe um lead da reciclagem tal como estava. Devolve o id do lead. */
create or replace function public.restore_trashed_lead(p_trash_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trash public.lead_trash;
  v_lead public.leads;
  v_table text;
  v_rows jsonb;
begin
  select * into v_trash from public.lead_trash where id = p_trash_id for update;
  if not found or not public.is_workspace_staff(v_trash.workspace_id) then
    raise exception using errcode = 'P0002', message = 'Não encontrado na reciclagem.';
  end if;
  if exists (select 1 from public.leads where id = v_trash.lead_id) then
    raise exception using errcode = '23505', message = 'Este lead já foi reposto.';
  end if;

  v_lead := jsonb_populate_record(null::public.leads, v_trash.snapshot -> 'lead');
  -- Sempre o mesmo lead e o mesmo workspace da reciclagem.
  v_lead.id := v_trash.lead_id;
  v_lead.workspace_id := v_trash.workspace_id;
  -- O que entretanto deixou de existir fica vazio.
  if v_lead.client_of is not null and not exists (select 1 from public.leads where id = v_lead.client_of) then
    v_lead.client_of := null;
  end if;
  if v_lead.assigned_to is not null and not exists (select 1 from public.workspace_members m where m.workspace_id = v_lead.workspace_id and m.user_id = v_lead.assigned_to) then
    v_lead.assigned_to := null;
  end if;
  if v_lead.sector_id is not null and not exists (select 1 from public.sectors s where s.id = v_lead.sector_id) then
    v_lead.sector_id := null;
  end if;
  -- Sem "Lead editado" nem "Criado" a mais: a linha do tempo volta como estava.
  perform set_config('vnd.skip_update_log', '1', true);
  insert into public.leads select v_lead.*;

  foreach v_table in array public.vnd_lead_child_tables() loop
    -- O que os gatilhos criaram ao inserir o lead sai; entra o que estava guardado.
    execute format('delete from public.%I where lead_id = $1', v_table) using v_lead.id;
    v_rows := v_trash.snapshot -> 'children' -> v_table;
    if v_rows is not null and jsonb_array_length(v_rows) > 0 then
      -- Só linhas deste lead e deste workspace.
      execute format(
        'insert into public.%I select r.* from jsonb_populate_recordset(null::public.%I, $1) r where r.workspace_id = $2 and r.lead_id = $3',
        v_table, v_table
      ) using v_rows, v_lead.workspace_id, v_lead.id;
    end if;
  end loop;
  perform set_config('vnd.skip_update_log', '', true);

  -- Os outros projetos do mesmo cliente voltam a apontar para ele.
  update public.leads set client_of = v_lead.id
   where id in (select (jsonb_array_elements_text(v_trash.snapshot -> 'client_of_children'))::uuid)
     and client_of is null;

  delete from public.lead_trash where id = p_trash_id;
  return v_lead.id;
end
$$;
grant execute on function public.restore_trashed_lead(uuid) to authenticated;

-- 4. Juntar leads: também os campos personalizados e a nota afixada -------------
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
  v_dup_custom jsonb;
  v_dup_pinned text;
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
  -- Campos personalizados e nota afixada dos duplicados (os do principal ganham).
  select jsonb_object_agg(e.key, e.value) into v_dup_custom
    from public.leads l, jsonb_each(l.custom) e
   where l.id = any(p_duplicate_ids);
  select string_agg(l.pinned_note, ' · ' order by l.number) into v_dup_pinned
    from public.leads l
   where l.id = any(p_duplicate_ids) and l.pinned_note is not null;

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
    pinned_note = coalesce(v_primary.pinned_note, left(v_dup_pinned, 200)),
    custom = coalesce(v_dup_custom, '{}'::jsonb) || v_primary.custom,
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
