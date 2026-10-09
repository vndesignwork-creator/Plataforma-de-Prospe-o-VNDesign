-- =============================================================================
-- Correções da análise de outubro de 2026
--  1. Lead criado já como "Contactado" segue as mesmas regras de quem muda para
--     "Contactado" (data do 1.º contacto e follow-up agendado).
--  2. Mudar a morada ou a cidade apaga a localização antiga do mapa
--     (exceto se o ponto foi posto à mão).
--  3. Juntar leads passa também as propostas e as análises de site para o lead
--     principal (antes eram apagadas com o duplicado).
--  4. Anonimizar (RGPD) limpa também propostas, análises de site, detalhes da
--     linha do tempo e o histórico de importações.
--  5. "Não contactar" com só um email bloqueia outros emails do mesmo domínio.
--  6. Permissões: um admin não se pode promover a dono nem remover o dono;
--     a linha do tempo não aceita registos "de sistema" escritos à mão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 e 2. Regras antes de gravar um lead
-- -----------------------------------------------------------------------------
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
        new.next_action_on := v_today + v_follow_up_days;
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

-- -----------------------------------------------------------------------------
-- 3. Juntar leads
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

  -- Move tudo o que pertence aos duplicados antes de os apagar
  -- (propostas e análises de site eram apagadas em cascata).
  update public.lead_activities set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.proposals set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
  update public.site_audits set lead_id = p_primary_id where lead_id = any(p_duplicate_ids);
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
    email_body = v_primary.email_body
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

-- -----------------------------------------------------------------------------
-- 4. Anonimizar (RGPD)
-- -----------------------------------------------------------------------------

-- Troca o nome de um lead nas listas guardadas das importações
-- (relatório e resposta da API: entradas e "duplicate_of").
create or replace function public.vnd_scrub_import_entries(p_entries jsonb, p_lead_id uuid, p_label text)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
begin
  return case when jsonb_typeof(p_entries) is distinct from 'array' then p_entries else coalesce((
    select jsonb_agg(
      case when jsonb_typeof(e) <> 'object' then e else
        (case when e ->> 'lead_id' = p_lead_id::text then e || jsonb_build_object('company_name', p_label) else e end)
        || case when jsonb_typeof(e -> 'duplicate_of') = 'array'
             then jsonb_build_object('duplicate_of', public.vnd_scrub_import_entries(e -> 'duplicate_of', p_lead_id, p_label))
             else '{}'::jsonb end
      end
      order by ord)
    from jsonb_array_elements(p_entries) with ordinality as x(e, ord)
  ), '[]'::jsonb) end;
end
$$;

create or replace function public.vnd_scrub_import_jobs(p_workspace_id uuid, p_lead_id uuid, p_label text)
returns void
language sql
set search_path = ''
as $$
  update public.import_jobs j set
    report = public.vnd_scrub_import_entries(j.report, p_lead_id, p_label),
    options = case when jsonb_typeof(j.options #> '{response,results}') = 'array'
      then jsonb_set(j.options, '{response,results}',
                     public.vnd_scrub_import_entries(j.options #> '{response,results}', p_lead_id, p_label))
      else j.options end
  where j.workspace_id = p_workspace_id
    and (j.report::text like '%' || p_lead_id::text || '%' or j.options::text like '%' || p_lead_id::text || '%')
$$;

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
  v_label text;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or not public.vnd_can_write(v_lead.workspace_id) then
    raise exception using errcode = 'P0002', message = 'Lead não encontrado.';
  end if;
  if v_lead.anonymized_at is not null then
    return p_lead_id;
  end if;
  v_label := 'Lead anonimizado #' || v_lead.number;

  if p_add_to_do_not_contact then
    insert into public.do_not_contact (workspace_id, company_name, website, email, reason, created_by)
    values (v_lead.workspace_id, v_lead.company_name, v_lead.website, v_lead.email,
            coalesce(p_reason, 'Pedido de remoção (RGPD)'), auth.uid());
  end if;

  update public.leads set
    company_name = v_label,
    website = null, address = null, latitude = null, longitude = null,
    geocode_status = null, geocoded_at = null,
    problems = null, email = null, phone = null, contact_name = null,
    next_action_text = null, next_action_on = null,
    notes = null, approach_angle = null, source_url = null,
    email_subject = null, email_body = null,
    anonymized_at = now()
  where id = p_lead_id;

  -- Notas e textos guardados na atividade também podem conter dados pessoais:
  -- dos detalhes ficam só os campos técnicos (estados, datas, números, totais).
  delete from public.lead_activities where lead_id = p_lead_id and type = 'note';
  update public.lead_activities a set
    body = null,
    payload = coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(a.payload) as e(k, v)
       where k = any (array['from', 'to', 'on', 'fields', 'source', 'job_id', 'proposal_id', 'code', 'total',
                            'status', 'kind', 'tone', 'model', 'audit_id', 'pagespeed', 'issues', 'part',
                            'merged_numbers', 'added_to_do_not_contact'])
    ), '{}'::jsonb)
  where a.lead_id = p_lead_id;

  -- Propostas: ficam os valores (estatísticas), sai o texto escrito para a empresa.
  update public.proposals set title = 'Proposta anonimizada', intro = null, notes = null
   where lead_id = p_lead_id;
  -- As análises de site identificam a empresa (endereço, título, descrição).
  delete from public.site_audits where lead_id = p_lead_id;
  perform public.vnd_scrub_import_jobs(v_lead.workspace_id, p_lead_id, v_label);

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (v_lead.workspace_id, p_lead_id, 'anonymized',
          jsonb_build_object('added_to_do_not_contact', p_add_to_do_not_contact),
          public.vnd_actor_user_id(), public.vnd_actor_token_id());

  return p_lead_id;
end
$$;

-- Apagar um lead também tira o nome dele do histórico de importações.
create or replace function public.vnd_leads_after_delete()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.vnd_scrub_import_jobs(old.workspace_id, old.id, 'Lead apagado #' || old.number);
  return old;
end
$$;

create trigger leads_after_delete after delete on public.leads
  for each row execute function public.vnd_leads_after_delete();

revoke execute on function public.vnd_scrub_import_jobs(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.vnd_leads_after_delete() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. "Não contactar": também pelo domínio do email
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
       -- geral@empresa.pt na lista bloqueia info@empresa.pt (gmail, sapo… não contam).
       or (i.email_d is not null and public.vnd_email_business_domain(d.email_normalized) = i.email_d)
     )
$$;

-- -----------------------------------------------------------------------------
-- 6. Permissões
-- -----------------------------------------------------------------------------
create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  )
$$;

-- Admins gerem membros, mas só o dono cria/altera donos; ninguém remove o dono.
drop policy members_admin on public.workspace_members;
create policy members_admin_insert on public.workspace_members for insert to authenticated
  with check (public.is_workspace_admin(workspace_id)
              and (role <> 'owner' or public.is_workspace_owner(workspace_id)));
create policy members_admin_update on public.workspace_members for update to authenticated
  using (public.is_workspace_admin(workspace_id)
         and (role <> 'owner' or public.is_workspace_owner(workspace_id)))
  with check (public.is_workspace_admin(workspace_id)
              and (role <> 'owner' or public.is_workspace_owner(workspace_id)));
create policy members_admin_delete on public.workspace_members for delete to authenticated
  using (public.is_workspace_admin(workspace_id) and role <> 'owner');

-- Registos "de sistema" (criado, editado, estado, junção, anonimização) só
-- nascem dos gatilhos e funções da base de dados, nunca de um pedido direto.
drop policy lead_activities_insert on public.lead_activities;
create policy lead_activities_insert on public.lead_activities for insert to authenticated
  with check (public.is_workspace_member(workspace_id)
              and actor_user_id = (select auth.uid())
              and type not in ('created', 'updated', 'status_changed', 'merged', 'anonymized'));
