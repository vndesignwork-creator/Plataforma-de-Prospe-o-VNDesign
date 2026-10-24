-- =============================================================================
-- Etiquetas em vários leads de uma vez (lista → ações em massa), renomear,
-- juntar e apagar etiquetas (Definições → Etiquetas) e pesquisar no texto das
-- notas e chamadas (pesquisa rápida).
-- Maiúsculas e acentos contam como iguais, como no editor da ficha.
-- =============================================================================

-- Uma lista de etiquetas sem repetidas (fica a primeira escrita, pela ordem).
create or replace function public.vnd_dedupe_tags(p_tags text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(s.tag order by s.ord), '{}')
    from (
      select distinct on (public.vnd_normalize_text(u.tag)) u.tag, u.ord
        from unnest(p_tags) with ordinality as u(tag, ord)
       where public.vnd_normalize_text(u.tag) is not null
       order by public.vnd_normalize_text(u.tag), u.ord
    ) s
$$;

/**
 * Acrescenta (p_add) ou tira (p_remove) uma etiqueta nos leads indicados.
 * Os que já têm 10 etiquetas ficam como estão. Devolve quantos mudaram.
 */
create or replace function public.lead_tags_bulk(
  p_workspace_id uuid,
  p_ids uuid[],
  p_add text default null,
  p_remove text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_add is not null then
    update public.leads l
       set tags = public.vnd_dedupe_tags(l.tags || p_add)
     where l.workspace_id = p_workspace_id
       and l.id = any(p_ids)
       and l.anonymized_at is null
       and cardinality(l.tags) < 10
       and not exists (
         select 1 from unnest(l.tags) x where public.vnd_normalize_text(x) = public.vnd_normalize_text(p_add)
       );
  else
    update public.leads l
       set tags = array(
         select x from unnest(l.tags) x where public.vnd_normalize_text(x) <> public.vnd_normalize_text(p_remove)
       )
     where l.workspace_id = p_workspace_id
       and l.id = any(p_ids)
       and exists (
         select 1 from unnest(l.tags) x where public.vnd_normalize_text(x) = public.vnd_normalize_text(p_remove)
       );
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
grant execute on function public.lead_tags_bulk(uuid, uuid[], text, text) to authenticated;

/**
 * Renomeia uma etiqueta em todos os leads (p_to já usada = juntar as duas;
 * p_to null = apagar). Sem "Lead editado" em cada lead. Devolve quantos mudaram.
 */
create or replace function public.lead_tags_rename(p_workspace_id uuid, p_from text, p_to text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads l
     set tags = public.vnd_dedupe_tags(array(
       select case when public.vnd_normalize_text(u.x) = public.vnd_normalize_text(p_from) then p_to else u.x end
         from unnest(l.tags) with ordinality as u(x, ord)
        order by u.ord
     ))
   where l.workspace_id = p_workspace_id
     and exists (
       select 1 from unnest(l.tags) x where public.vnd_normalize_text(x) = public.vnd_normalize_text(p_from)
     );
  get diagnostics v_count = row_count;
  perform set_config('vnd.skip_update_log', '', true);
  return v_count;
end
$$;
grant execute on function public.lead_tags_rename(uuid, text, text) to authenticated;

-- Pesquisa nas notas e chamadas registadas (sem acentos nem maiúsculas).
create index if not exists lead_activities_notes_search_idx
  on public.lead_activities using gin (public.vnd_normalize_text(body) extensions.gin_trgm_ops)
  where type in ('note', 'call_logged');

create or replace function public.search_lead_notes(p_workspace_id uuid, p_q text, p_limit integer default 6)
returns table (
  id uuid,
  type text,
  body text,
  created_at timestamptz,
  lead_id uuid,
  lead_number integer,
  company_name text,
  project_title text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.type::text, a.body, a.created_at, l.id, l.number, l.company_name, l.project_title
    from public.lead_activities a
    join public.leads l on l.id = a.lead_id
   where a.workspace_id = p_workspace_id
     and a.type in ('note', 'call_logged')
     and public.vnd_normalize_text(a.body) like '%' || replace(replace(replace(public.vnd_normalize_text(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     and l.archived_at is null
     and l.anonymized_at is null
   order by a.created_at desc
   limit least(greatest(coalesce(p_limit, 6), 1), 20)
$$;
grant execute on function public.search_lead_notes(uuid, text, integer) to authenticated;
