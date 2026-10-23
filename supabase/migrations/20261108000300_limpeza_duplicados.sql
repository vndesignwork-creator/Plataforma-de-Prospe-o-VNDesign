-- =============================================================================
-- Limpeza de duplicados: todos os pares de leads com o mesmo email, o mesmo site
-- ou o mesmo nome (normalizados, como na deteção ao criar), para juntar em lote.
-- Os pares marcados "Não são duplicados" ficam guardados e deixam de aparecer.
-- =============================================================================

create table public.lead_duplicate_ignores (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Guardado sempre com lead_a < lead_b.
  lead_a uuid not null,
  lead_b uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, lead_a, lead_b),
  check (lead_a < lead_b),
  foreign key (workspace_id, lead_a) references public.leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, lead_b) references public.leads (workspace_id, id) on delete cascade
);

alter table public.lead_duplicate_ignores enable row level security;
create policy lead_duplicate_ignores_member_all on public.lead_duplicate_ignores for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Grupos com a mesma chave (email, site ou nome normalizados), os mais recentes
-- primeiro; sem anonimizados. Os pares ignorados tiram-se depois (na API).
create or replace function public.lead_duplicate_groups(p_workspace_id uuid)
returns table (reason text, ids uuid[], latest timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select id, created_at, email_normalized, website_key, nullif(company_name_normalized, '') as name_key
      from public.leads
     where workspace_id = p_workspace_id and anonymized_at is null
  ),
  keyed as (
    select 'email' as reason, email_normalized as k, id, created_at from base where email_normalized is not null
    union all
    select 'website', website_key, id, created_at from base where website_key is not null
    union all
    select 'name', name_key, id, created_at from base where name_key is not null
  )
  select reason, (array_agg(id order by created_at desc))[1:20], max(created_at)
    from keyed
   group by reason, k
  having count(*) > 1
   order by max(created_at) desc
   limit 300
$$;
grant execute on function public.lead_duplicate_groups(uuid) to authenticated;
