-- Pedir indicação: quem é que nos indicou cada lead (o cliente que falou de
-- nós) e o registo de quando se pediu a indicação.
alter type public.activity_type add value if not exists 'referral_asked';
alter table public.leads add column if not exists referred_by uuid references public.leads(id) on delete set null;
create index if not exists leads_referred_by_idx on public.leads (workspace_id, referred_by) where referred_by is not null;
