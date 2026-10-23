-- =============================================================================
-- Etiquetas livres nos leads ("feira de março", "indicação do João", "urgente").
-- Até 10 por lead, 30 caracteres cada; filtro por etiqueta na lista (basta uma
-- coincidir) e a contagem de cada etiqueta para as sugestões e os filtros.
-- =============================================================================

alter table public.leads
  add column if not exists tags text[] not null default '{}'
    constraint leads_tags_check check (cardinality(tags) <= 10);
create index if not exists leads_tags_idx on public.leads using gin (tags);

-- Etiquetas usadas no workspace (para sugerir ao escrever e para os filtros).
create or replace function public.lead_tag_counts(p_workspace_id uuid)
returns table (tag text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.tag, count(*)::bigint
    from public.leads l, unnest(l.tags) as t(tag)
   where l.workspace_id = p_workspace_id
     and l.anonymized_at is null
   group by t.tag
   order by count(*) desc, t.tag
$$;
grant execute on function public.lead_tag_counts(uuid) to authenticated;
