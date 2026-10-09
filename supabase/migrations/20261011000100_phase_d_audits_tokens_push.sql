-- =============================================================================
-- VNDesign Leads — Fase D: auditor de sites, tokens de integração e push (PWA)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auditor de sites: histórico das análises de cada lead
-- -----------------------------------------------------------------------------
create table public.site_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  url text not null,
  final_url text,
  status text not null check (status in ('done', 'error')),
  http_status integer,
  response_ms integer,
  https boolean,
  ssl_valid boolean,
  ssl_issuer text,
  ssl_expires_at timestamptz,
  ssl_error text,
  has_viewport boolean,
  zoom_blocked boolean,
  pagespeed_mobile smallint check (pagespeed_mobile between 0 and 100),
  metrics jsonb not null default '{}'::jsonb,
  title text,
  meta_description text,
  cms text,
  copyright_year integer,
  issues jsonb not null default '[]'::jsonb,
  suggested_problems text,
  suggested_mobile public.mobile_status,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index site_audits_lead_idx on public.site_audits (lead_id, created_at desc);
alter table public.site_audits enable row level security;
create policy site_audits_member_all on public.site_audits for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Tokens pessoais para integrações ("Authorization: Bearer vnd_…").
-- Só se guarda o hash SHA-256; o token completo é mostrado uma única vez.
-- -----------------------------------------------------------------------------
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  prefix text not null,
  token_hash text not null unique,
  scopes text[] not null default array['leads:import']
    check (scopes <@ array['leads:read', 'leads:write', 'leads:import']),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_tokens_ws_user_idx on public.api_tokens (workspace_id, user_id);
alter table public.api_tokens enable row level security;
-- Cada utilizador vê e gere os seus tokens. A verificação de um token na API é
-- feita no servidor com a chave de serviço (pelo hash).
create policy api_tokens_own on public.api_tokens for all to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Idempotência da importação pela API (cabeçalho Idempotency-Key)
alter table public.import_jobs add column idempotency_key text;
create unique index import_jobs_idempotency_idx on public.import_jobs (workspace_id, idempotency_key)
  where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- Notificações push (PWA): uma subscrição por browser/dispositivo
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_ws_idx on public.push_subscriptions (workspace_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Autor das alterações feitas com um token de integração.
-- A API valida o token no servidor e fala com o Postgres com a chave de serviço;
-- nesse caso (e só nesse) o utilizador e o token chegam nos cabeçalhos
-- X-Vnd-Actor-User / X-Vnd-Token-Id, que o PostgREST expõe em request.headers.
-- -----------------------------------------------------------------------------
create or replace function public.vnd_request_header(p_name text)
returns text
language sql stable
set search_path = ''
as $$
  select case when coalesce(auth.role(), '') = 'service_role'
              then nullif(current_setting('request.headers', true), '')::json ->> p_name end
$$;

create or replace function public.vnd_actor_user_id()
returns uuid
language sql stable
set search_path = ''
as $$
  select coalesce(auth.uid(), nullif(public.vnd_request_header('x-vnd-actor-user'), '')::uuid)
$$;

create or replace function public.vnd_actor_token_id()
returns uuid
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('vnd.actor_token_id', true), ''),
                  nullif(public.vnd_request_header('x-vnd-token-id'), ''))::uuid
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

create or replace function public.import_leads(
  p_workspace_id uuid,
  p_job_id uuid,
  p_items jsonb,
  p_keep_numbers boolean default true
)
returns table (item_index integer, action text, lead_id uuid, number integer)
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_lead jsonb;
  v_idx integer := 0;
  v_number integer;
  v_id uuid;
  v_fields text[];
begin
  if not public.vnd_can_write(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Sem permissão neste workspace.';
  end if;

  -- A atividade "Lead criado" fica com origem "importação".
  perform set_config('vnd.source', 'import', true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_lead := coalesce(v_item -> 'lead', '{}'::jsonb);

    if v_item ->> 'action' = 'create' then
      v_number := nullif(v_item ->> 'number', '')::integer;
      if v_number is not null and (not p_keep_numbers or exists (
           select 1 from public.leads where workspace_id = p_workspace_id and leads.number = v_number)) then
        v_number := null;
      end if;

      insert into public.leads (
        workspace_id, number, company_name, sector_id, website, city, address, problems, pagespeed,
        mobile, email, phone, contact_name, status, channel, first_contact_on, last_follow_up_on,
        next_action_text, next_action_on, estimated_value, notes, approach_angle, source_url,
        suggested_on, email_subject, email_body, created_by
      ) values (
        p_workspace_id, v_number, v_lead ->> 'company_name', nullif(v_lead ->> 'sector_id', '')::uuid,
        v_lead ->> 'website', v_lead ->> 'city', v_lead ->> 'address', v_lead ->> 'problems',
        nullif(v_lead ->> 'pagespeed', '')::smallint,
        coalesce(nullif(v_lead ->> 'mobile', ''), 'desconhecido')::public.mobile_status,
        v_lead ->> 'email', v_lead ->> 'phone', v_lead ->> 'contact_name',
        coalesce(nullif(v_lead ->> 'status', ''), 'identificado')::public.lead_status,
        nullif(v_lead ->> 'channel', '')::public.lead_channel,
        nullif(v_lead ->> 'first_contact_on', '')::date, nullif(v_lead ->> 'last_follow_up_on', '')::date,
        v_lead ->> 'next_action_text', nullif(v_lead ->> 'next_action_on', '')::date,
        nullif(v_lead ->> 'estimated_value', '')::numeric, v_lead ->> 'notes', v_lead ->> 'approach_angle',
        v_lead ->> 'source_url', nullif(v_lead ->> 'suggested_on', '')::date,
        v_lead ->> 'email_subject', v_lead ->> 'email_body', public.vnd_actor_user_id()
      )
      returning leads.id, leads.number into v_id, v_number;

      item_index := v_idx; action := 'created'; lead_id := v_id; number := v_number;
      return next;

    elsif v_item ->> 'action' = 'merge' then
      v_id := (v_item ->> 'target_id')::uuid;
      if not exists (select 1 from public.leads where id = v_id and workspace_id = p_workspace_id) then
        raise exception using errcode = 'P0002', message = 'Lead a juntar não encontrado (linha ' || (v_idx + 1) || ').';
      end if;

      -- Só preenche campos vazios no lead existente (nunca apaga dados).
      select array_agg(k) into v_fields
        from jsonb_each(v_lead) e(k, v)
        join lateral (select to_jsonb(l) -> e.k as cur from public.leads l where l.id = v_id) c on true
       where e.v is not null and e.v <> 'null'::jsonb and e.v <> '""'::jsonb
         and (c.cur is null or c.cur = 'null'::jsonb or c.cur = '""'::jsonb
              or (e.k = 'mobile' and c.cur = '"desconhecido"'::jsonb))
         and e.k in ('sector_id','website','city','address','problems','pagespeed','mobile','email','phone',
                     'contact_name','channel','first_contact_on','last_follow_up_on','next_action_text',
                     'next_action_on','estimated_value','notes','approach_angle','source_url','suggested_on',
                     'email_subject','email_body');

      if coalesce(cardinality(v_fields), 0) > 0 then
        update public.leads l set
          sector_id = case when 'sector_id' = any(v_fields) then (v_lead ->> 'sector_id')::uuid else l.sector_id end,
          website = case when 'website' = any(v_fields) then v_lead ->> 'website' else l.website end,
          city = case when 'city' = any(v_fields) then v_lead ->> 'city' else l.city end,
          address = case when 'address' = any(v_fields) then v_lead ->> 'address' else l.address end,
          problems = case when 'problems' = any(v_fields) then v_lead ->> 'problems' else l.problems end,
          pagespeed = case when 'pagespeed' = any(v_fields) then (v_lead ->> 'pagespeed')::smallint else l.pagespeed end,
          mobile = case when 'mobile' = any(v_fields) then (v_lead ->> 'mobile')::public.mobile_status else l.mobile end,
          email = case when 'email' = any(v_fields) then v_lead ->> 'email' else l.email end,
          phone = case when 'phone' = any(v_fields) then v_lead ->> 'phone' else l.phone end,
          contact_name = case when 'contact_name' = any(v_fields) then v_lead ->> 'contact_name' else l.contact_name end,
          channel = case when 'channel' = any(v_fields) then (v_lead ->> 'channel')::public.lead_channel else l.channel end,
          first_contact_on = case when 'first_contact_on' = any(v_fields) then (v_lead ->> 'first_contact_on')::date else l.first_contact_on end,
          last_follow_up_on = case when 'last_follow_up_on' = any(v_fields) then (v_lead ->> 'last_follow_up_on')::date else l.last_follow_up_on end,
          next_action_text = case when 'next_action_text' = any(v_fields) then v_lead ->> 'next_action_text' else l.next_action_text end,
          next_action_on = case when 'next_action_on' = any(v_fields) then (v_lead ->> 'next_action_on')::date else l.next_action_on end,
          estimated_value = case when 'estimated_value' = any(v_fields) then (v_lead ->> 'estimated_value')::numeric else l.estimated_value end,
          notes = case when 'notes' = any(v_fields) then v_lead ->> 'notes' else l.notes end,
          approach_angle = case when 'approach_angle' = any(v_fields) then v_lead ->> 'approach_angle' else l.approach_angle end,
          source_url = case when 'source_url' = any(v_fields) then v_lead ->> 'source_url' else l.source_url end,
          suggested_on = case when 'suggested_on' = any(v_fields) then (v_lead ->> 'suggested_on')::date else l.suggested_on end,
          email_subject = case when 'email_subject' = any(v_fields) then v_lead ->> 'email_subject' else l.email_subject end,
          email_body = case when 'email_body' = any(v_fields) then v_lead ->> 'email_body' else l.email_body end
        where l.id = v_id;
      end if;

      insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
      values (p_workspace_id, v_id, 'imported',
              jsonb_build_object('job_id', p_job_id, 'fields', coalesce(to_jsonb(v_fields), '[]'::jsonb)),
              public.vnd_actor_user_id(), public.vnd_actor_token_id());

      select l.number into v_number from public.leads l where l.id = v_id;
      item_index := v_idx; action := 'merged'; lead_id := v_id; number := v_number;
      return next;
    end if;

    v_idx := v_idx + 1;
  end loop;
end
$$;
