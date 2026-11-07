-- =============================================================================
-- Redes sociais dos leads também nos duplicados, na pesquisa e na importação:
--  * social_keys: a chave de cada link (vnd_website_key: "facebook.com/cafe"),
--    mantida pelo gatilho; dois leads com a mesma página são duplicados.
--  * A pesquisa (search_text) passa a encontrar os links das redes sociais.
--  * find_lead_duplicates aceita os links (p_social_links) e devolve o motivo
--    "social"; a pré-visualização da importação passa-os também.
--  * import_lead_social_links: junta os links da folha aos leads importados.
-- =============================================================================

create or replace function public.vnd_social_keys(p text[])
returns text[]
language sql immutable parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(distinct k order by k), '{}')
    from unnest(coalesce(p, '{}')) u, lateral public.vnd_website_key(u) k
   where k is not null
$$;

alter table public.leads add column if not exists social_keys text[] not null default '{}';
comment on column public.leads.social_keys is 'Chaves das redes sociais (para duplicados); mantido pelo gatilho leads_social.';
create index if not exists leads_social_keys_idx on public.leads using gin (social_keys);

-- Corre depois de leads_before_write (os gatilhos correm por ordem do nome), que refaz o search_text.
create or replace function public.vnd_leads_social()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.social_keys := public.vnd_social_keys(new.social_links);
  if cardinality(new.social_links) > 0 then
    new.search_text := coalesce(public.vnd_normalize_text(concat_ws(' ', new.search_text, array_to_string(new.social_links, ' '))), '');
  end if;
  return new;
end
$$;
drop trigger if exists leads_social on public.leads;
create trigger leads_social before insert or update on public.leads
  for each row execute function public.vnd_leads_social();

do $$
begin
  perform set_config('vnd.skip_update_log', '1', true);
  update public.leads set social_links = social_links where cardinality(social_links) > 0;
  perform set_config('vnd.skip_update_log', '', true);
end
$$;

-- -----------------------------------------------------------------------------
-- Duplicados: também pela mesma página de rede social.
-- -----------------------------------------------------------------------------
drop function if exists public.find_lead_duplicates(uuid, text, text, text, uuid, real);
create or replace function public.find_lead_duplicates(
  p_workspace_id uuid,
  p_company_name text,
  p_website text default null,
  p_email text default null,
  p_exclude_id uuid default null,
  p_similarity real default 0.6,
  p_social_links text[] default null
)
returns table (
  lead_id uuid,
  number integer,
  company_name text,
  city text,
  status public.lead_status,
  website text,
  email text,
  reasons text[],
  strength text,
  score real
)
language sql stable
set search_path = ''
as $$
  with input as (
    select public.vnd_normalize_company(p_company_name) as name_n,
           public.vnd_website_key(p_website) as web_k,
           public.vnd_normalize_email(p_email) as email_n,
           public.vnd_email_business_domain(public.vnd_normalize_email(p_email)) as email_d,
           public.vnd_social_keys(p_social_links) as social_k
  ),
  candidates as (
    select l.*,
           i.name_n, i.web_k, i.email_n, i.email_d, i.social_k,
           case when i.name_n is null then 0
                else extensions.similarity(l.company_name_normalized, i.name_n) end as sim
      from public.leads l
      cross join input i
     where l.workspace_id = p_workspace_id
       and (p_exclude_id is null or l.id <> p_exclude_id)
       and l.anonymized_at is null
       and (
            (i.web_k is not null and l.website_key = i.web_k)
         or (i.email_n is not null and l.email_normalized = i.email_n)
         or (i.name_n is not null and l.company_name_normalized = i.name_n)
         or (i.email_d is not null and (l.website_key = i.email_d or l.email_domain = i.email_d))
         or (i.web_k is not null and l.email_domain = i.web_k)
         or (cardinality(i.social_k) > 0 and (l.social_keys && i.social_k or l.website_key = any(i.social_k)))
         or (i.web_k is not null and i.web_k = any(l.social_keys))
         or (i.name_n is not null and l.company_name_normalized operator(extensions.%) i.name_n)
       )
  ),
  scored as (
    select c.*,
           array_remove(array[
             case when c.web_k is not null and c.website_key = c.web_k then 'website' end,
             case when c.email_n is not null and c.email_normalized = c.email_n then 'email' end,
             case when c.name_n is not null and c.company_name_normalized = c.name_n then 'name' end,
             case when (c.email_d is not null and (c.website_key = c.email_d or c.email_domain = c.email_d))
                    or (c.web_k is not null and c.email_domain = c.web_k) then 'email_domain' end,
             case when (cardinality(c.social_k) > 0 and (c.social_keys && c.social_k or c.website_key = any(c.social_k)))
                    or (c.web_k is not null and c.web_k = any(c.social_keys)) then 'social' end
           ], null) as strong_reasons
      from candidates c
  )
  select s.id, s.number, s.company_name, s.city, s.status, s.website, s.email,
         case when cardinality(s.strong_reasons) > 0 then s.strong_reasons
              else array['similar_name'] end,
         case when cardinality(s.strong_reasons) > 0 then 'strong' else 'possible' end,
         case when cardinality(s.strong_reasons) > 0 then 1::real else s.sim::real end
    from scored s
   where cardinality(s.strong_reasons) > 0 or s.sim >= p_similarity
   order by 10 desc, s.number
   limit 20
$$;
revoke execute on function public.find_lead_duplicates(uuid, text, text, text, uuid, real, text[]) from public, anon;
grant execute on function public.find_lead_duplicates(uuid, text, text, text, uuid, real, text[]) to authenticated, service_role;

-- Pré-visualização da importação: cada linha pode trazer "social_links": ["…"].
create or replace function public.find_import_duplicates(p_workspace_id uuid, p_rows jsonb)
returns table (row_index integer, lead_id uuid, number integer, company_name text,
               status public.lead_status, reasons text[], strength text, score real)
language sql stable
set search_path = ''
as $$
  select (r.ord - 1)::int, d.lead_id, d.number, d.company_name, d.status, d.reasons, d.strength, d.score
    from jsonb_array_elements(p_rows) with ordinality r(value, ord)
    cross join lateral public.find_lead_duplicates(
      p_workspace_id, r.value ->> 'company_name', r.value ->> 'website', r.value ->> 'email', null, 0.6,
      case when jsonb_typeof(r.value -> 'social_links') = 'array'
           then array(select jsonb_array_elements_text(r.value -> 'social_links')) end) d
$$;

-- -----------------------------------------------------------------------------
-- Importação: os links da folha juntam-se aos que o lead já tem (máx. 10).
-- p_items: [{ "lead_id": "...", "social_links": ["https://…"] }, ...]
-- -----------------------------------------------------------------------------
create or replace function public.import_lead_social_links(p_workspace_id uuid, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if not public.vnd_can_write(p_workspace_id) then
    raise exception using errcode = '42501', message = 'Sem permissão neste workspace.';
  end if;
  perform set_config('vnd.skip_update_log', '1', true);
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    -- Os de agora primeiro; um link só uma vez (pela chave: "facebook.com/cafe").
    update public.leads l
       set social_links = coalesce((
             select (array_agg(d.u order by d.ord))[1:10]
               from (
                 select distinct on (public.vnd_website_key(t.u)) t.u, t.ord
                   from unnest(l.social_links || array(select jsonb_array_elements_text(v_item -> 'social_links')))
                        with ordinality as t(u, ord)
                  where public.vnd_website_key(t.u) is not null
                  order by public.vnd_website_key(t.u), t.ord
               ) d
           ), l.social_links)
     where l.id = (v_item ->> 'lead_id')::uuid and l.workspace_id = p_workspace_id;
  end loop;
  perform set_config('vnd.skip_update_log', '', true);
end
$$;
revoke execute on function public.import_lead_social_links(uuid, jsonb) from public, anon;
grant execute on function public.import_lead_social_links(uuid, jsonb) to authenticated, service_role;
