-- Renovações e avenças: domínio, alojamento, manutenção mensal… de cada cliente,
-- com o valor, de quanto em quanto tempo e a próxima data. O cron diário avisa
-- (tarefa + aviso) uns dias antes; "Renovado" passa à data seguinte e pode
-- registar o pagamento.
create table public.client_renewals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  kind text not null default 'other' check (kind in ('domain', 'hosting', 'maintenance', 'other')),
  title text not null check (length(btrim(title)) between 1 and 200),
  amount numeric(12, 2) not null default 0 check (amount >= 0 and amount < 10000000),
  period text not null default 'yearly' check (period in ('monthly', 'quarterly', 'yearly')),
  next_due_on date not null,
  remind_days integer not null default 30 check (remind_days between 0 and 120),
  active boolean not null default true,
  notes text check (notes is null or length(notes) <= 2000),
  -- O vencimento para o qual já se avisou (não repete o aviso).
  reminded_for date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, lead_id) references public.leads (workspace_id, id) on delete cascade
);
create index client_renewals_lead_idx on public.client_renewals (lead_id, next_due_on);
create index client_renewals_due_idx on public.client_renewals (workspace_id, active, next_due_on);
create trigger client_renewals_touch before update on public.client_renewals
  for each row execute function public.vnd_touch_updated_at();
alter table public.client_renewals enable row level security;
create policy client_renewals_member_all on public.client_renewals for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
