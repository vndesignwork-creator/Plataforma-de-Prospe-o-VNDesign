-- =============================================================================
-- Sequência multicanal na Prospeção (ex.: dia 0 WhatsApp, dia 3 email, dia 7
-- ligar). Os passos estão nas definições (settings.prospecting_sequence); aqui
-- fica em que passo vai cada lead (à parte dos leads, para não encher a linha
-- do tempo com "Lead editado").
-- =============================================================================

create table public.lead_sequence_state (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid not null,
  -- Próximo passo a fazer (0 = o primeiro; = nº de passos quando terminou).
  step integer not null default 0 check (step >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, lead_id),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);

alter table public.lead_sequence_state enable row level security;
create policy lead_sequence_state_member_all on public.lead_sequence_state for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
