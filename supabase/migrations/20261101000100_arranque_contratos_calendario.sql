-- =============================================================================
-- Arranque automático do projeto, contratos e calendário subscrito.
--  - services: prazo de entrega (dias) e revisões incluídas por serviço.
--  - Ao passar a "Cliente", o projeto prepara-se sozinho (prazo, revisões,
--    tarefas da lista do serviço e plano de pagamentos).
--  - lead_contracts: contratos gerados a partir da proposta, aceites online.
--  - calendar_feeds: link secreto (.ics) para o Google Calendar / iPhone.
-- =============================================================================

alter type public.activity_type add value if not exists 'project_started';
alter type public.activity_type add value if not exists 'contract_sent';
alter type public.activity_type add value if not exists 'contract_accepted';

-- -----------------------------------------------------------------------------
-- Serviços: prazo e revisões
-- -----------------------------------------------------------------------------
alter table public.services
  add column delivery_days integer check (delivery_days is null or delivery_days between 1 and 365),
  add column revisions_included integer check (revisions_included is null or revisions_included between 0 and 50);

-- Valores de partida para os serviços de origem (editáveis em Definições → Serviços).
update public.services set delivery_days = case key
    when 'landing_page' then 14
    when 'site_institucional' then 30
    when 'blog' then 21
    when 'loja_online' then 45
    when 'identidade_visual' then 21
    when 'flyers_cartazes' then 7
    when 'posts_redes' then 7
    when 'estampas' then 10
  end,
  revisions_included = case when key in ('landing_page', 'site_institucional', 'blog', 'loja_online', 'identidade_visual') then 2 else 1 end
where delivery_days is null and key in ('landing_page', 'site_institucional', 'blog', 'loja_online', 'identidade_visual', 'flyers_cartazes', 'posts_redes', 'estampas');

-- -----------------------------------------------------------------------------
-- Arranque do projeto
-- -----------------------------------------------------------------------------
-- Prepara o que faltar: prazo e revisões (pelos serviços do lead), tarefas
-- (listas dos serviços, se ainda não houver tarefas) e plano de pagamentos
-- (proposta aceite ou valor estimado, se ainda não houver pagamentos).
-- p_force = false (automático): só se o projeto ainda não tiver sido preparado.
create or replace function public.vnd_project_kickoff(p_lead_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_settings jsonb;
  v_split integer[];
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_days integer;
  v_revisions integer;
  v_due date;
  v_tasks integer := 0;
  v_templates text[] := '{}';
  v_value numeric;
  v_pos numeric;
  v_payments integer := 0;
  v_amounts numeric[];
  v_n integer;
  i integer;
  t record;
  item text;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or v_lead.anonymized_at is not null or v_lead.archived_at is not null then
    return null;
  end if;
  select settings into v_settings from public.workspaces where id = v_lead.workspace_id;
  if not p_force then
    if coalesce((v_settings -> 'features' ->> 'projects')::boolean, true) = false
       or coalesce((v_settings -> 'features' ->> 'project_kickoff')::boolean, true) = false then
      return null;
    end if;
    if exists (select 1 from public.lead_projects where lead_id = p_lead_id) then
      return null;
    end if;
  end if;

  -- Prazo e revisões: o maior dos serviços do lead.
  select max(s.delivery_days), max(s.revisions_included) into v_days, v_revisions
  from public.services s
  where s.workspace_id = v_lead.workspace_id and s.key = any (v_lead.services);
  v_due := case when v_days is not null then v_today + v_days end;
  insert into public.lead_projects (lead_id, workspace_id, due_on, revisions_included)
  values (p_lead_id, v_lead.workspace_id, v_due, coalesce(v_revisions, 2))
  on conflict (lead_id) do update
    set due_on = coalesce(public.lead_projects.due_on, excluded.due_on);
  select due_on into v_due from public.lead_projects where lead_id = p_lead_id;

  -- Tarefas: as listas dos serviços do lead (sem repetir), se ainda não tiver tarefas.
  if not exists (select 1 from public.lead_tasks where lead_id = p_lead_id) then
    v_pos := 0;
    for t in
      select tt.name, tt.items from public.task_templates tt
      where tt.workspace_id = v_lead.workspace_id and tt.service = any (v_lead.services)
      order by tt.sort_order, tt.created_at
    loop
      v_templates := v_templates || t.name;
      foreach item in array t.items loop
        if btrim(item) <> '' and not exists (
          select 1 from public.lead_tasks where lead_id = p_lead_id and lower(btrim(title)) = lower(btrim(item))
        ) then
          v_pos := v_pos + 1;
          insert into public.lead_tasks (workspace_id, lead_id, title, position)
          values (v_lead.workspace_id, p_lead_id, left(btrim(item), 300), v_pos);
          v_tasks := v_tasks + 1;
        end if;
      end loop;
    end loop;
  end if;

  -- Plano de pagamentos, se ainda não houver pagamentos.
  select coalesce(array_agg(x::integer), '{}') into v_split
  from jsonb_array_elements_text(coalesce(v_settings -> 'project_kickoff' -> 'payment_split', '[50, 50]'::jsonb)) as x;
  if cardinality(v_split) > 0 and not exists (select 1 from public.lead_payments where lead_id = p_lead_id) then
    select max(total) into v_value from public.proposals where lead_id = p_lead_id and status = 'aceite';
    v_value := coalesce(v_value, v_lead.estimated_value);
    if v_value is not null and v_value > 0 then
      v_n := cardinality(v_split);
      v_amounts := '{}';
      for i in 1 .. v_n loop
        v_amounts := v_amounts || (floor(v_value * v_split[i]) / 100.0);
      end loop;
      -- O resto dos arredondamentos vai para a última prestação.
      v_amounts[v_n] := round(v_amounts[v_n] + (v_value - (select sum(a) from unnest(v_amounts) a)), 2);
      for i in 1 .. v_n loop
        insert into public.lead_payments (workspace_id, lead_id, description, amount, due_on)
        values (
          v_lead.workspace_id, p_lead_id,
          case
            when v_n = 1 then 'Pagamento único'
            when i = 1 then format('Sinal (%s%%)', v_split[i])
            when i = v_n then format('Entrega (%s%%)', v_split[i])
            else format('Prestação %s (%s%%)', i, v_split[i])
          end,
          v_amounts[i],
          case when i = 1 then v_today end
        );
        v_payments := v_payments + 1;
      end loop;
    end if;
  end if;

  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (
    v_lead.workspace_id, p_lead_id, 'project_started'::public.activity_type,
    jsonb_build_object('tasks', v_tasks, 'templates', to_jsonb(v_templates), 'due_on', v_due, 'payments', v_payments, 'revisions', coalesce(v_revisions, 2)),
    public.vnd_actor_user_id(), public.vnd_actor_token_id()
  );
  return jsonb_build_object('tasks', v_tasks, 'templates', to_jsonb(v_templates), 'due_on', v_due, 'payments', v_payments, 'revisions', coalesce(v_revisions, 2));
end
$$;
revoke execute on function public.vnd_project_kickoff(uuid, boolean) from public, anon, authenticated;

-- Pela ficha ("Preparar o projeto"): só para membros do workspace.
create or replace function public.start_project(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select workspace_id into v_workspace from public.leads where id = p_lead_id;
  if v_workspace is null or not public.is_workspace_member(v_workspace) then
    raise exception 'Lead não encontrado' using errcode = 'P0002';
  end if;
  return public.vnd_project_kickoff(p_lead_id, true);
end
$$;
grant execute on function public.start_project(uuid) to authenticated;

-- Automático: quando o lead passa a "Cliente".
create or replace function public.vnd_leads_project_kickoff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cliente' and old.status is distinct from 'cliente' then
    perform public.vnd_project_kickoff(new.id, false);
  end if;
  return new;
end
$$;
create trigger leads_project_kickoff after update of status on public.leads
  for each row execute function public.vnd_leads_project_kickoff();

-- -----------------------------------------------------------------------------
-- Contratos
-- -----------------------------------------------------------------------------
create table public.lead_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  proposal_id uuid references public.proposals(id) on delete set null,
  number integer not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  -- { provider: {...}, client: {...}, sections: [{ title, body }] }
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aceite')),
  -- Link do cliente (/c/<token>).
  token text not null unique check (length(token) between 16 and 64),
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_name text check (accepted_name is null or length(btrim(accepted_name)) between 1 and 120),
  accepted_ip text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, number),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_contracts_lead_idx on public.lead_contracts (lead_id, created_at desc);
create trigger lead_contracts_touch before update on public.lead_contracts
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_contracts enable row level security;
create policy lead_contracts_member_all on public.lead_contracts for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Um contrato aceite já não muda (o que o cliente aceitou fica igual).
create or replace function public.vnd_contracts_lock_accepted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'aceite' and (new.content is distinct from old.content or new.title is distinct from old.title or new.status <> 'aceite') then
    raise exception 'Este contrato já foi aceite pelo cliente e não pode ser alterado.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger lead_contracts_lock before update on public.lead_contracts
  for each row execute function public.vnd_contracts_lock_accepted();

-- -----------------------------------------------------------------------------
-- Calendário subscrito (um link por utilizador)
-- -----------------------------------------------------------------------------
create table public.calendar_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique check (length(token) between 16 and 64),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_own on public.calendar_feeds for all to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
