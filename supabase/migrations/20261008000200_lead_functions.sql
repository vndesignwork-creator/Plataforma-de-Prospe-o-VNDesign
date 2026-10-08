-- =============================================================================
-- VNDesign Leads — funções de negócio: duplicados, "não contactar",
-- juntar leads e anonimizar (RGPD).
-- As funções de leitura são SECURITY INVOKER (o RLS aplica-se). merge_leads e
-- anonymize_lead são SECURITY DEFINER porque mexem na atividade (que o
-- utilizador não pode editar diretamente) e por isso verificam explicitamente
-- se o utilizador pertence ao workspace do lead.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Deteção de duplicados
--   forte    → mesmo domínio do website, mesmo email, mesmo nome normalizado,
--              ou domínio do email = domínio do website de outro lead
--   possível → nome com semelhança (trigramas) ≥ p_similarity
-- -----------------------------------------------------------------------------
create or replace function public.find_lead_duplicates(
  p_workspace_id uuid,
  p_company_name text,
  p_website text default null,
  p_email text default null,
  p_exclude_id uuid default null,
  p_similarity real default 0.6
)
returns table (
  lead_id uuid,
  number integer,
  company_name text,
  city text,
  status public.lead_status,
  website text,
  email text,
  reasons text[],
  strength text,
  score real
)
language sql stable
set search_path = ''
as $$
  with input as (
    select public.vnd_normalize_company(p_company_name) as name_n,
           public.vnd_website_key(p_website) as web_k,
           public.vnd_normalize_email(p_email) as email_n,
           public.vnd_email_business_domain(public.vnd_normalize_email(p_email)) as email_d
  ),
  candidates as (
    select l.*,
           i.name_n, i.web_k, i.email_n, i.email_d,
           case when i.name_n is null then 0
                else extensions.similarity(l.company_name_normalized, i.name_n) end as sim
      from public.leads l
      cross join input i
     where l.workspace_id = p_workspace_id
       and (p_exclude_id is null or l.id <> p_exclude_id)
       and l.anonymized_at is null
       and (
            (i.web_k is not null and l.website_key = i.web_k)
         or (i.email_n is not null and l.email_normalized = i.email_n)
         or (i.name_n is not null and l.company_name_normalized = i.name_n)
         or (i.email_d is not null and (l.website_key = i.email_d or l.email_domain = i.email_d))
         or (i.web_k is not null and l.email_domain = i.web_k)
         or (i.name_n is not null and l.company_name_normalized operator(extensions.%) i.name_n)
       )
  ),
  scored as (
    select c.*,
           array_remove(array[
             case when c.web_k is not null and c.website_key = c.web_k then 'website' end,
             case when c.email_n is not null and c.email_normalized = c.email_n then 'email' end,
             case when c.name_n is not null and c.company_name_normalized = c.name_n then 'name' end,
             case when (c.email_d is not null and (c.website_key = c.email_d or c.email_domain = c.email_d))
                    or (c.web_k is not null and c.email_domain = c.web_k) then 'email_domain' end
           ], null) as strong_reasons
      from candidates c
  )
  select s.id, s.number, s.company_name, s.city, s.status, s.website, s.email,
         case when cardinality(s.strong_reasons) > 0 then s.strong_reasons
              else array['similar_name'] end,
         case when cardinality(s.strong_reasons) > 0 then 'strong' else 'possible' end,
         case when cardinality(s.strong_reasons) > 0 then 1::real else s.sim::real end
    from scored s
   where cardinality(s.strong_reasons) > 0 or s.sim >= p_similarity
   order by 10 desc, s.number
   limit 20
$$;

-- -----------------------------------------------------------------------------
-- Lista "não contactar": devolve as entradas que bloqueiam esta empresa.
-- -----------------------------------------------------------------------------
create or replace function public.check_do_not_contact(
  p_workspace_id uuid,
  p_company_name text,
  p_website text default null,
  p_email text default null
)
returns setof public.do_not_contact
language sql stable
set search_path = ''
as $$
  with input as (
    select public.vnd_normalize_company(p_company_name) as name_n,
           public.vnd_website_key(p_website) as web_k,
           public.vnd_normalize_email(p_email) as email_n,
           public.vnd_email_business_domain(public.vnd_normalize_email(p_email)) as email_d
  )
  select d.*
    from public.do_not_contact d
    cross join input i
   where d.workspace_id = p_workspace_id
     and (
          (i.name_n is not null and d.company_name_normalized = i.name_n)
       or (i.web_k is not null and d.website_key = i.web_k)
       or (i.email_n is not null and d.email_normalized = i.email_n)
       or (i.email_d is not null and d.website_key = i.email_d)
       or (i.web_k is not null and public.vnd_email_business_domain(d.email_normalized) = i.web_k)
     )
$$;

-- -----------------------------------------------------------------------------
-- Pode escrever neste workspace? Membro autenticado, ou chamada de servidor com
-- a chave de serviço (integrações por token, que já validaram o workspace).
-- -----------------------------------------------------------------------------
create or replace function public.vnd_can_write(p_workspace_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select public.is_workspace_member(p_workspace_id)
      or coalesce(auth.role(), '') = 'service_role'
$$;

-- -----------------------------------------------------------------------------
-- Juntar leads: aplica os valores escolhidos ao lead principal, move a
-- atividade dos duplicados para o principal e apaga os duplicados.
-- Com p_duplicate_ids vazio, só aplica os valores (dados vindos de um
-- registo novo que era duplicado de um lead existente).
-- -----------------------------------------------------------------------------
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

  -- Move a atividade antes de apagar os duplicados.
  update public.lead_activities set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  delete from public.leads where id = any(p_duplicate_ids);

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
    email_body = v_primary.email_body
  where id = p_primary_id;

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (
    v_primary.workspace_id, p_primary_id, 'merged',
    jsonb_build_object(
      'merged_numbers', coalesce(to_jsonb(v_numbers), '[]'::jsonb),
      'fields', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(v_values) k), '[]'::jsonb)
    ),
    auth.uid(),
    nullif(current_setting('vnd.actor_token_id', true), '')::uuid
  );

  return p_primary_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Anonimizar (RGPD): apaga dados de contacto e texto livre, mantém setor,
-- estado, cidade e valor para as estatísticas. Opcionalmente acrescenta a
-- empresa à lista "não contactar" (guardando só nome, website e email).
-- -----------------------------------------------------------------------------
create or replace function public.anonymize_lead(
  p_lead_id uuid,
  p_add_to_do_not_contact boolean default false,
  p_reason text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or not public.vnd_can_write(v_lead.workspace_id) then
    raise exception using errcode = 'P0002', message = 'Lead não encontrado.';
  end if;
  if v_lead.anonymized_at is not null then
    return p_lead_id;
  end if;

  if p_add_to_do_not_contact then
    insert into public.do_not_contact (workspace_id, company_name, website, email, reason, created_by)
    values (v_lead.workspace_id, v_lead.company_name, v_lead.website, v_lead.email,
            coalesce(p_reason, 'Pedido de remoção (RGPD)'), auth.uid());
  end if;

  update public.leads set
    company_name = 'Lead anonimizado #' || v_lead.number,
    website = null, address = null, latitude = null, longitude = null,
    problems = null, email = null, phone = null, contact_name = null,
    next_action_text = null, next_action_on = null,
    notes = null, approach_angle = null, source_url = null,
    email_subject = null, email_body = null,
    anonymized_at = now()
  where id = p_lead_id;

  -- Notas e textos guardados na atividade também podem conter dados pessoais.
  delete from public.lead_activities where lead_id = p_lead_id and type = 'note';
  update public.lead_activities set body = null where lead_id = p_lead_id;

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (v_lead.workspace_id, p_lead_id, 'anonymized',
          jsonb_build_object('added_to_do_not_contact', p_add_to_do_not_contact),
          auth.uid(), nullif(current_setting('vnd.actor_token_id', true), '')::uuid);

  return p_lead_id;
end
$$;

-- As funções de negócio só são chamadas por utilizadores autenticados.
revoke execute on function public.find_lead_duplicates(uuid, text, text, text, uuid, real) from public, anon;
revoke execute on function public.check_do_not_contact(uuid, text, text, text) from public, anon;
revoke execute on function public.merge_leads(uuid, uuid[], jsonb) from public, anon;
revoke execute on function public.anonymize_lead(uuid, boolean, text) from public, anon;
grant execute on function public.find_lead_duplicates(uuid, text, text, text, uuid, real) to authenticated, service_role;
grant execute on function public.check_do_not_contact(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.merge_leads(uuid, uuid[], jsonb) to authenticated, service_role;
grant execute on function public.anonymize_lead(uuid, boolean, text) to authenticated, service_role;
