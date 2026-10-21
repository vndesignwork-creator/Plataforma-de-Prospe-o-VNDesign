-- =============================================================================
-- Pagamentos, reuniões e projetos em curso
--  - lead_payments: o que o cliente paga (sinal, prestações), com a data
--    prevista e a data em que foi pago.
--  - lead_meetings: reuniões marcadas com o lead (convite por email, lembrete).
--  - leads.project_completed_at: projeto do cliente concluído (página Projetos).
-- =============================================================================

alter type public.activity_type add value if not exists 'payment_received';
alter type public.activity_type add value if not exists 'meeting_scheduled';
alter type public.activity_type add value if not exists 'meeting_canceled';
alter type public.activity_type add value if not exists 'project_completed';
alter type public.activity_type add value if not exists 'project_reopened';

-- -----------------------------------------------------------------------------
-- Pagamentos
-- -----------------------------------------------------------------------------
create table public.lead_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  due_on date,
  paid_on date,
  method text check (method is null or length(btrim(method)) between 1 and 60),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_payments_lead_idx on public.lead_payments (lead_id, due_on nulls last, created_at);
create index lead_payments_ws_idx on public.lead_payments (workspace_id, paid_on, due_on);
create trigger lead_payments_touch before update on public.lead_payments
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_payments enable row level security;
create policy lead_payments_member_all on public.lead_payments for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- -----------------------------------------------------------------------------
-- Reuniões
-- -----------------------------------------------------------------------------
create table public.lead_meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  starts_at timestamptz not null,
  duration_min integer not null default 30 check (duration_min between 5 and 480),
  -- Morada, link (Google Meet, Zoom…) ou "Telefone".
  location text check (location is null or length(btrim(location)) between 1 and 500),
  notes text check (notes is null or length(notes) <= 2000),
  invite_sent_to text,
  reminder_sent_at timestamptz,
  canceled_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index lead_meetings_lead_idx on public.lead_meetings (lead_id, starts_at desc);
create index lead_meetings_upcoming_idx on public.lead_meetings (workspace_id, starts_at) where canceled_at is null;
create trigger lead_meetings_touch before update on public.lead_meetings
  for each row execute function public.vnd_touch_updated_at();
alter table public.lead_meetings enable row level security;
create policy lead_meetings_member_all on public.lead_meetings for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Anonimizar um lead apaga as reuniões (podem ter moradas ou notas pessoais).
create or replace function public.vnd_leads_anonymized_meetings()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.anonymized_at is not null and old.anonymized_at is null then
    delete from public.lead_meetings where lead_id = new.id;
  end if;
  return new;
end
$$;
create trigger leads_anonymized_meetings after update of anonymized_at on public.leads
  for each row execute function public.vnd_leads_anonymized_meetings();

-- -----------------------------------------------------------------------------
-- Projetos: concluir / reabrir (regista a sua própria atividade)
-- -----------------------------------------------------------------------------
alter table public.leads add column project_completed_at timestamptz;

create or replace function public.set_project_completed(p_lead_id uuid, p_completed boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.leads;
begin
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado' using errcode = 'P0002';
  end if;
  if (v_lead.project_completed_at is not null) = p_completed then
    return;
  end if;
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads
     set project_completed_at = case when p_completed then now() end
   where id = p_lead_id;
  perform set_config('vnd.skip_update_log', '', true);
  insert into public.lead_activities (workspace_id, lead_id, type, payload, actor_user_id, actor_token_id)
  values (v_lead.workspace_id, p_lead_id,
          (case when p_completed then 'project_completed' else 'project_reopened' end)::public.activity_type,
          '{}'::jsonb, public.vnd_actor_user_id(), public.vnd_actor_token_id());
end
$$;
grant execute on function public.set_project_completed(uuid, boolean) to authenticated;
