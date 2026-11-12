-- =============================================================================
-- Limpeza de duplicados: também os leads com a mesma página de rede social
-- (social_keys, ex.: "facebook.com/cafe"), como já acontece ao criar e importar.
-- =============================================================================

create or replace function public.lead_duplicate_groups(p_workspace_id uuid)
returns table (reason text, ids uuid[], latest timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select id, created_at, email_normalized, website_key, social_keys, nullif(company_name_normalized, '') as name_key
      from public.leads
     where workspace_id = p_workspace_id and anonymized_at is null
  ),
  keyed as (
    select 'email' as reason, email_normalized as k, id, created_at from base where email_normalized is not null
    union all
    select 'website', website_key, id, created_at from base where website_key is not null
    union all
    select 'name', name_key, id, created_at from base where name_key is not null
    union all
    select 'social', s.k, b.id, b.created_at from base b cross join lateral unnest(b.social_keys) as s(k)
  )
  select reason, (array_agg(id order by created_at desc))[1:20], max(created_at)
    from keyed
   group by reason, k
  having count(*) > 1
   order by max(created_at) desc
   limit 300
$$;
grant execute on function public.lead_duplicate_groups(uuid) to authenticated;
