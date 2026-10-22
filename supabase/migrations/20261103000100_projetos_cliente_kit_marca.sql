-- =============================================================================
-- Vários projetos por cliente e kit da marca.
--  - leads.client_of: um projeto novo de um cliente que volta é um registo
--    próprio (com tarefas, pagamentos, horas, contrato…) ligado ao cliente
--    principal; leads.project_title dá-lhe o nome ("Loja online").
--  - dashboard_summary: os projetos ligados não contam como leads nem clientes
--    novos, mas o valor soma ao valor ganho.
--  - lead_brand_kits / lead_accesses: logótipos, cores, tipos de letra, links e
--    acessos do cliente (palavras-passe cifradas pelo servidor), partilhados por
--    todos os projetos do cliente (guardados no registo principal).
-- =============================================================================

alter table public.leads
  add column if not exists client_of uuid,
  add column if not exists project_title text check (project_title is null or length(btrim(project_title)) between 1 and 120);
alter table public.leads
  add constraint leads_client_of_fkey foreign key (workspace_id, client_of)
  references public.leads (workspace_id, id) on delete set null (client_of);
alter table public.leads add constraint leads_client_of_not_self check (client_of is null or client_of <> id);
create index if not exists leads_client_of_idx on public.leads (client_of) where client_of is not null;

create or replace function public.dashboard_summary(p_workspace_id uuid, p_weeks integer default 12)
returns jsonb
language sql stable
set search_path = ''
as $$
  -- Só os registos principais: um projeto novo de um cliente que volta (client_of)
  -- não é um lead novo nem outro cliente; o valor dele soma ao valor ganho.
  with l as (
    select * from public.leads where workspace_id = p_workspace_id and client_of is null
  ),
  extra as (
    select coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric as value
      from public.leads where workspace_id = p_workspace_id and client_of is not null
  ),
  stage as (
    -- 0 identificado · 1 contactado · 2 respondeu · 3 reunião · 4 proposta · 5 cliente
    select l.id,
           greatest(
             case l.status
               when 'identificado' then 0 when 'contactado' then 1 when 'respondeu' then 2
               when 'reuniao' then 3 when 'proposta_enviada' then 4 when 'cliente' then 5
               when 'sem_interesse' then 1 -- sem interesse implica ter havido contacto
               else 0 end,
             coalesce((
               select max(case a.payload ->> 'to'
                 when 'contactado' then 1 when 'respondeu' then 2 when 'reuniao' then 3
                 when 'proposta_enviada' then 4 when 'cliente' then 5 else 0 end)
               from public.lead_activities a
               where a.lead_id = l.id and a.type = 'status_changed'
             ), 0)
           ) as rank
      from l
  ),
  totals as (
    select count(*)::int as total,
           count(*) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada')
                              and archived_at is null)::int as active,
           count(*) filter (where status = 'cliente')::int as won,
           count(*) filter (where status = 'sem_interesse')::int as lost,
           count(*) filter (where status = 'em_pausa')::int as paused,
           count(*) filter (where status <> 'identificado')::int as contacted,
           count(*) filter (where archived_at is not null)::int as archived,
           coalesce(sum(estimated_value), 0)::numeric as value_total,
           coalesce(sum(estimated_value) filter (where status = 'cliente'), 0)::numeric + (select value from extra) as value_won,
           coalesce(sum(estimated_value) filter (where status in ('identificado','contactado','respondeu','reuniao','proposta_enviada')
                                                   and archived_at is null), 0)::numeric as value_pipeline
      from l
  ),
  weeks as (
    select generate_series(
             date_trunc('week', (now() at time zone 'Europe/Lisbon')::date - (p_weeks - 1) * 7),
             date_trunc('week', (now() at time zone 'Europe/Lisbon')::date),
             interval '1 week')::date as week_start
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) || jsonb_build_object(
        'conversion_rate', case when t.total = 0 then 0 else round(t.won::numeric / t.total, 4) end,
        'conversion_rate_contacted', case when t.contacted = 0 then 0 else round(t.won::numeric / t.contacted, 4) end
      ) from totals t),
    'by_sector', coalesce((
      select jsonb_agg(x order by x.sort_order, x.name) from (
        select s.id, s.name, s.emoji, s.sort_order,
               count(l.id)::int as count, coalesce(sum(l.estimated_value), 0)::numeric as value
          from public.sectors s
          left join l on l.sector_id = s.id
         where s.workspace_id = p_workspace_id and (s.archived_at is null or l.id is not null)
         group by s.id
        union all
        select null, 'Sem setor', null, 9999, count(*)::int, coalesce(sum(estimated_value), 0)::numeric
          from l where l.sector_id is null
        having count(*) > 0
      ) x), '[]'::jsonb),
    'by_status', (
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', coalesce(c.count, 0)) order by s.ord)
        from unnest(enum_range(null::public.lead_status)) with ordinality s(status, ord)
        left join (select status, count(*)::int as count from l group by status) c on c.status = s.status),
    'by_service', (
      select coalesce(jsonb_agg(jsonb_build_object('service', s.service, 'count', s.count, 'won', s.won)
                                order by s.ord), '[]'::jsonb)
        from (
          -- Os serviços do workspace (Definições → Serviços), pela ordem definida;
          -- os escondidos só aparecem se ainda houver leads com eles.
          select sv.key as service,
                 row_number() over (order by sv.sort_order, sv.label) as ord,
                 count(l.id)::int as count,
                 count(l.id) filter (where l.status = 'cliente')::int as won
            from public.services sv
            left join l on sv.key = any(l.services)
           where sv.workspace_id = p_workspace_id
           group by sv.id
          having sv.archived_at is null or count(l.id) > 0
        ) s),
    'by_channel', (
      select jsonb_agg(jsonb_build_object('channel', s.channel, 'count', coalesce(c.count, 0)) order by s.ord)
        from (select channel, ord from unnest(enum_range(null::public.lead_channel)) with ordinality u(channel, ord)
              union all select null, 99) s
        left join (select channel, count(*)::int as count from l group by channel) c
          on c.channel is not distinct from s.channel),
    'funnel', (
      select jsonb_agg(jsonb_build_object('stage', f.stage, 'count',
               (select count(*) from stage where stage.rank >= f.rank)::int) order by f.rank)
        from (values (0, 'identificado'), (1, 'contactado'), (2, 'respondeu'),
                     (3, 'reuniao'), (4, 'proposta_enviada'), (5, 'cliente')) f(rank, stage)),
    'weekly', (
      select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'count', (
               select count(*) from l
                where coalesce(l.suggested_on, (l.created_at at time zone 'Europe/Lisbon')::date) >= w.week_start
                  and coalesce(l.suggested_on, (l.created_at at time zone 'Europe/Lisbon')::date) < w.week_start + 7
             )::int) order by w.week_start)
        from weeks w)
  )
$$;

create table public.lead_brand_kits (
  lead_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- [{ "name", "hex" }]
  colors jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array'),
  -- [{ "name", "usage" }]
  fonts jsonb not null default '[]'::jsonb check (jsonb_typeof(fonts) = 'array'),
  -- [{ "label", "url" }]
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  -- [{ "name", "path", "size", "type" }] no bucket "brand-kits"
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  notes text check (notes is null or length(notes) <= 5000),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create trigger lead_brand_kits_touch before update on public.lead_brand_kits
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_brand_kits enable row level security;
create policy lead_brand_kits_member_all on public.lead_brand_kits for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create table public.lead_accesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  url text check (url is null or length(url) <= 500),
  username text check (username is null or length(username) <= 200),
  -- Palavra-passe cifrada pelo servidor (AES-256-GCM); nunca em claro na base de dados.
  secret_ciphertext text,
  notes text check (notes is null or length(notes) <= 1000),
  -- Os colaboradores do projeto veem este acesso.
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_accesses_lead_idx on public.lead_accesses (lead_id, label);
create trigger lead_accesses_touch before update on public.lead_accesses
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_accesses enable row level security;
create policy lead_accesses_member_all on public.lead_accesses for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('brand-kits', 'brand-kits', false, 26214400)
on conflict (id) do nothing;
