-- =============================================================================
-- 1) Histórico dos sites vigiados: cada verificação fica guardada (tempo no ar,
--    quebras, tempo de resposta e o relatório mensal para o cliente).
-- 2) Origem de cada lead (formulário do site, análise grátis, prospeção, importação…),
--    para as Estatísticas "De onde vêm os leads".
-- 3) Vistas do formulário da análise grátis, por site e por dia (pedidos ÷ vistas).
-- =============================================================================

-- 1) ---------------------------------------------------------------------------
create table if not exists public.site_monitor_checks (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  monitor_id uuid not null references public.site_monitors (id) on delete cascade,
  checked_at timestamptz not null,
  -- ok: respondeu nesta verificação; down: contava como "em baixo" (2 falhas seguidas, sem falso alarme).
  ok boolean not null,
  down boolean not null default false,
  response_ms integer,
  status_code integer
);
create index if not exists site_monitor_checks_monitor_idx on public.site_monitor_checks (monitor_id, checked_at);
alter table public.site_monitor_checks enable row level security;
drop policy if exists site_monitor_checks_member_select on public.site_monitor_checks;
create policy site_monitor_checks_member_select on public.site_monitor_checks for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Cada verificação guardada em site_monitors (checked_at muda) entra no histórico.
create or replace function public.vnd_site_monitor_log_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.checked_at is null or new.checked_at is not distinct from old.checked_at then
    return new;
  end if;
  insert into public.site_monitor_checks (workspace_id, monitor_id, checked_at, ok, down, response_ms, status_code)
  values (new.workspace_id, new.id, new.checked_at, new.fail_count = 0, new.is_up is false, new.response_ms, new.status_code);
  -- De vez em quando, apaga o que tem mais de 400 dias (chega para o relatório de cada mês do último ano).
  if random() < 0.02 then
    delete from public.site_monitor_checks where monitor_id = new.id and checked_at < now() - interval '400 days';
  end if;
  return new;
end;
$$;
drop trigger if exists site_monitors_log_check on public.site_monitors;
create trigger site_monitors_log_check after update of checked_at on public.site_monitors
  for each row execute function public.vnd_site_monitor_log_check();

-- 2) ---------------------------------------------------------------------------
alter table public.leads add column if not exists origin text
  check (origin is null or origin in ('manual', 'site_form', 'free_audit', 'prospecting', 'import', 'business_card', 'api'));

-- As importações (import_leads) marcam vnd.source = 'import': a origem fica "import" sozinha.
create or replace function public.vnd_leads_default_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.origin is null and nullif(current_setting('vnd.source', true), '') = 'import' then
    new.origin := 'import';
  end if;
  return new;
end;
$$;
drop trigger if exists leads_default_origin on public.leads;
create trigger leads_default_origin before insert on public.leads
  for each row execute function public.vnd_leads_default_origin();

-- Os leads que já existem: a origem que se consegue saber pela linha do tempo.
update public.leads l set origin = 'free_audit'
 where l.origin is null and exists (
   select 1 from public.lead_activities a
    where a.lead_id = l.id and a.type = 'note' and a.payload ->> 'free_audit' = 'true' and (a.payload ->> 'created')::boolean is true);
update public.leads l set origin = 'site_form'
 where l.origin is null and exists (
   select 1 from public.lead_activities a
    where a.lead_id = l.id and a.type = 'note' and a.payload ->> 'via' = 'site_form' and (a.payload ->> 'created')::boolean is true);
update public.leads l set origin = 'business_card'
 where l.origin is null and exists (
   select 1 from public.lead_activities a
    where a.lead_id = l.id and a.type = 'note' and a.payload ->> 'via' = 'business_card' and (a.payload ->> 'created')::boolean is true);
update public.leads l set origin = 'import'
 where l.origin is null and exists (
   select 1 from public.lead_activities a
    where a.lead_id = l.id and a.type = 'created' and a.payload ->> 'source' = 'import');
update public.leads l set origin = 'prospecting'
 where l.origin is null and exists (
   select 1 from public.lead_generation_runs r
    where r.workspace_id = l.workspace_id and r.candidates @> jsonb_build_array(jsonb_build_object('added_lead_id', l.id::text)));
update public.leads l set origin = 'api'
 where l.origin is null and exists (
   select 1 from public.lead_activities a
    where a.lead_id = l.id and a.type = 'created' and a.actor_token_id is not null);
update public.leads l set origin = 'manual'
 where l.origin is null and exists (
   select 1 from public.lead_activities a
    where a.lead_id = l.id and a.type = 'created' and a.actor_user_id is not null and a.actor_token_id is null);

-- Por origem (desde sempre): leads, quantos são clientes e quanto valem.
create or replace function public.stats_by_origin(p_workspace_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('origin', o.origin, 'leads', o.leads, 'clients', o.clients, 'value_won', o.value_won)
                            order by o.leads desc), '[]'::jsonb)
    from (
      select l.origin,
             count(*) as leads,
             count(*) filter (where l.status = 'cliente') as clients,
             coalesce(sum(l.estimated_value) filter (where l.status = 'cliente'), 0) as value_won
        from public.leads l
       where l.workspace_id = p_workspace_id and l.client_of is null and l.anonymized_at is null
       group by l.origin
    ) o
$$;
grant execute on function public.stats_by_origin(uuid) to authenticated;

-- 3) ---------------------------------------------------------------------------
create table if not exists public.free_audit_views (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  site text not null check (char_length(site) between 1 and 255),
  day date not null,
  views integer not null default 0,
  primary key (workspace_id, site, day)
);
alter table public.free_audit_views enable row level security;
drop policy if exists free_audit_views_member_select on public.free_audit_views;
create policy free_audit_views_member_select on public.free_audit_views for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- +1 vista (só a plataforma, com a chave de serviço, a chama).
create or replace function public.vnd_free_audit_count_view(p_workspace_id uuid, p_site text, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.free_audit_views (workspace_id, site, day, views)
  values (p_workspace_id, p_site, p_day, 1)
  on conflict (workspace_id, site, day) do update set views = public.free_audit_views.views + 1;
$$;
revoke all on function public.vnd_free_audit_count_view(uuid, text, date) from public, anon, authenticated;
grant execute on function public.vnd_free_audit_count_view(uuid, text, date) to service_role;
