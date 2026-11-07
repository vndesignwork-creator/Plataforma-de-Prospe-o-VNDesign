-- =============================================================================
-- Campo próprio para as redes sociais do lead (Facebook, Instagram, LinkedIn…),
-- à parte do site. Os links de redes sociais que já estavam na "Fonte" ou nas notas
-- ("Rede social: …", da correção anterior) passam também para aqui.
-- =============================================================================

alter table public.leads add column if not exists social_links text[] not null default '{}';
alter table public.leads drop constraint if exists leads_social_links_max;
alter table public.leads add constraint leads_social_links_max check (cardinality(social_links) <= 10);
comment on column public.leads.social_links is 'Páginas do lead nas redes sociais (não contam como site).';

do $$
begin
  perform set_config('vnd.skip_update_log', '1', true);

  -- A Fonte que é uma rede social fica também nas redes sociais.
  update public.leads
     set social_links = array_append(social_links, btrim(source_url))
   where public.vnd_is_social_url(source_url)
     and not (btrim(source_url) = any(social_links));

  -- "Rede social: …" nas notas: passa para o campo e sai das notas.
  update public.leads l
     set social_links = (
           select coalesce(array_agg(distinct u), '{}')
             from unnest(l.social_links || array(
               select btrim(m[1]) from regexp_matches(l.notes, 'Rede social: (\S+)', 'g') as m
             )) u
         ),
         notes = nullif(btrim(regexp_replace(l.notes, '\n?Rede social: \S+', '', 'g')), '')
   where l.notes ~ 'Rede social: \S+';

  perform set_config('vnd.skip_update_log', '', true);
end
$$;
