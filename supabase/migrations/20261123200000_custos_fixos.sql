-- Custos fixos mensais (alojamento, software, ferramentas…): entram no lucro do
-- mês, ao lado das despesas dos projetos. Cada um vale a partir de um mês e,
-- se acabar, até outro (meses "AAAA-MM" guardados como o primeiro dia do mês).
create table public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  starts_on date not null,
  ends_on date,
  note text check (note is null or length(note) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index fixed_costs_workspace_idx on public.fixed_costs (workspace_id, starts_on);
create trigger fixed_costs_touch before update on public.fixed_costs
  for each row execute function public.vnd_touch_updated_at();
alter table public.fixed_costs enable row level security;
create policy fixed_costs_member_all on public.fixed_costs for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
