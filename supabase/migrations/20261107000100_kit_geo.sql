-- =============================================================================
-- Kit GEO de um lead: dados do negócio para o schema.org / llms.txt (editáveis),
-- perguntas frequentes (geradas pela IA e editáveis) e o último perfil do
-- Google (nota e avaliações, comparadas com os concorrentes). Uma linha por lead.
-- =============================================================================

create table public.lead_geo (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid not null,
  business jsonb,
  faq jsonb not null default '[]'::jsonb,
  faq_generated_at timestamptz,
  google jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, lead_id),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);

alter table public.lead_geo enable row level security;
create policy lead_geo_member_all on public.lead_geo for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
