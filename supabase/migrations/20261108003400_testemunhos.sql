-- =============================================================================
-- Testemunhos dos clientes: no fim do projeto pede-se um testemunho (link
-- /o/<código>, sem login). O cliente dá uma nota de 1 a 5, escreve a opinião e
-- diz se autoriza a publicação com o nome. Os autorizados (e marcados "mostrar")
-- entram no PDF da proposta; com nota alta, a página sugere também o Google.
-- =============================================================================

alter type public.activity_type add value if not exists 'testimonial_received';

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null unique,
  token text not null unique check (length(token) between 16 and 64),
  status text not null default 'pendente' check (status in ('pendente', 'recebido')),
  rating smallint check (rating between 1 and 5),
  quote text check (quote is null or length(quote) <= 1500),
  author_name text check (author_name is null or length(author_name) <= 120),
  author_role text check (author_role is null or length(author_role) <= 120),
  -- O cliente autoriza mostrar o testemunho com o nome (propostas, site, redes).
  can_publish boolean not null default false,
  -- O dono decide se aparece nas propostas (só conta se o cliente autorizou).
  featured boolean not null default true,
  submitted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index testimonials_workspace_idx on public.testimonials (workspace_id, submitted_at desc);
create trigger testimonials_touch before update on public.testimonials
  for each row execute function public.vnd_touch_updated_at();
alter table public.testimonials enable row level security;
create policy testimonials_member_all on public.testimonials for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Juntar leads: o testemunho do duplicado passa para o principal (o resto igual a 20261108000500).
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
  -- O testemunho: fica o do lead principal; senão, o mais recente (de preferência já recebido).
  if not exists (select 1 from public.testimonials where lead_id = p_primary_id) then
    update public.testimonials set lead_id = p_primary_id
     where id = (select id from public.testimonials where lead_id = any(p_duplicate_ids)
                 order by (status = 'recebido') desc, created_at desc limit 1);
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


-- Reciclagem: apagar um lead guarda também o testemunho (e repô-lo devolve-o).
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
    'testimonials', 'lead_activities'
  ]
$$;
