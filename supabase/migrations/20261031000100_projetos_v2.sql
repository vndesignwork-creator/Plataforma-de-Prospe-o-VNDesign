-- =============================================================================
-- Projetos v2: prazo de entrega, fases, rondas de revisão, registo de horas,
-- ficheiros/entregas e página de acompanhamento para o cliente.
--  - lead_projects: 1 linha por cliente com projeto (criada na 1.ª alteração;
--    sem linha = fase "Briefing", sem prazo, 2 revisões incluídas).
--  - project_revisions, project_time_entries, project_deliverables.
-- =============================================================================

alter type public.activity_type add value if not exists 'project_stage_changed';
alter type public.activity_type add value if not exists 'revision_requested';
alter type public.activity_type add value if not exists 'deliverable_sent';
alter type public.activity_type add value if not exists 'deliverable_approved';

-- -----------------------------------------------------------------------------
-- Projeto (prazo, fase, revisões incluídas, link para o cliente)
-- -----------------------------------------------------------------------------
create table public.lead_projects (
  lead_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  due_on date,
  stage text not null default 'briefing' check (stage in ('briefing', 'producao', 'revisoes', 'entrega')),
  revisions_included integer not null default 2 check (revisions_included between 0 and 50),
  -- Link da página do cliente (/p/<token>); null = desligada.
  share_token text unique check (share_token is null or length(share_token) between 16 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_projects_ws_idx on public.lead_projects (workspace_id, due_on);
create trigger lead_projects_touch before update on public.lead_projects
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_projects enable row level security;
create policy lead_projects_member_all on public.lead_projects for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Rondas de revisão pedidas pelo cliente
-- -----------------------------------------------------------------------------
create table public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 500),
  -- Além das incluídas no preço: a cobrar à parte.
  billable boolean not null default false,
  requested_on date not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index project_revisions_lead_idx on public.project_revisions (lead_id, requested_on, created_at);
alter table public.project_revisions enable row level security;
create policy project_revisions_member_all on public.project_revisions for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Registo de horas (temporizador ▶/⏸ ou à mão)
-- -----------------------------------------------------------------------------
create table public.project_time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  -- null = o temporizador está a contar.
  ended_at timestamptz,
  notes text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index project_time_lead_idx on public.project_time_entries (lead_id, started_at desc);
-- Um temporizador a contar de cada vez, por utilizador.
create unique index project_time_running_idx on public.project_time_entries (user_id) where ended_at is null;
alter table public.project_time_entries enable row level security;
create policy project_time_entries_member_all on public.project_time_entries for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Ficheiros e entregas (links do Drive, Figma, Canva…)
-- -----------------------------------------------------------------------------
create table public.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  url text check (url is null or (length(url) <= 2000 and url ~* '^https?://')),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aprovada')),
  sent_at timestamptz,
  approved_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index project_deliverables_lead_idx on public.project_deliverables (lead_id, created_at);
create trigger project_deliverables_touch before update on public.project_deliverables
  for each row execute function public.vnd_touch_updated_at();
alter table public.project_deliverables enable row level security;
create policy project_deliverables_member_all on public.project_deliverables for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Anonimizar um lead desliga o link do cliente.
create or replace function public.vnd_leads_anonymized_project()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.anonymized_at is not null and old.anonymized_at is null then
    update public.lead_projects set share_token = null where lead_id = new.id;
  end if;
  return new;
end
$$;
create trigger leads_anonymized_project after update of anonymized_at on public.leads
  for each row execute function public.vnd_leads_anonymized_project();

-- -----------------------------------------------------------------------------
-- Modelos para pedir uma avaliação no Google ({{avaliacao}} = link das
-- Definições → Funcionalidades).
-- -----------------------------------------------------------------------------
create or replace function public.seed_review_templates(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order integer;
begin
  select coalesce(max(sort_order), 0) into v_order from public.contact_templates where workspace_id = p_workspace_id;

  insert into public.contact_templates (workspace_id, kind, name, subject, body, category, is_default, sort_order)
  select p_workspace_id, t.kind::public.template_kind, t.name, t.subject, t.body, null, false, v_order + t.n
  from (
    values
      (1, 'whatsapp', 'WhatsApp — pedido de avaliação', null,
       E'Olá {{contacto}}! 😊\n\nFoi um prazer trabalhar com a {{empresa}}. Se ficou satisfeito/a com o resultado, ajudava-me muito uma avaliação rápida no Google (1 minuto):\n{{avaliacao}}\n\nObrigado!\n{{meu_nome}}'),
      (2, 'general_email', 'Email — pedido de avaliação', 'Obrigado, {{empresa}}!',
       E'Olá {{contacto}},\n\nObrigado pela confiança! Foi um prazer trabalhar convosco.\n\nSe ficaram satisfeitos com o resultado, ajudava-me muito uma avaliação rápida no Google — leva menos de um minuto:\n{{avaliacao}}\n\nQualquer coisa que precisem, estou por aqui.\n\nCumprimentos,\n{{assinatura}}')
  ) as t(n, kind, name, subject, body)
  where not exists (
    select 1 from public.contact_templates c where c.workspace_id = p_workspace_id and c.name = t.name
  );
end
$$;
revoke execute on function public.seed_review_templates(uuid) from public, anon, authenticated;

select public.seed_review_templates(id) from public.workspaces;

-- Conta nova: também os modelos de avaliação.
create or replace function public.vnd_seed_category_templates_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select m.workspace_id into v_workspace_id
  from public.workspace_members m
  where m.user_id = new.id and m.role = 'owner'
  order by m.created_at desc
  limit 1;
  if v_workspace_id is not null then
    perform public.seed_category_templates(v_workspace_id);
    perform public.seed_whatsapp_templates(v_workspace_id);
    perform public.seed_review_templates(v_workspace_id);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_seed_category_templates_for_new_user() from public, anon, authenticated;
