-- =============================================================================
-- Uma página do Facebook, Instagram, LinkedIn, TikTok… não é o site da empresa.
--  * Os leads com uma rede social em "Website" passam-na para "Fonte" (ou, se a
--    Fonte já tiver outro link, para as notas) e ficam sem website.
--  * Deixam de se vigiar as redes sociais em "Sites dos clientes" (respondiam com
--    erro 400 e um certificado que não é do cliente).
-- A mesma lista em TypeScript: SOCIAL_HOSTS em packages/core/src/links.ts.
-- =============================================================================

create or replace function public.vnd_is_social_url(p text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(
    regexp_replace(
      split_part(
        regexp_replace(regexp_replace(lower(btrim(p)), '^[a-z][a-z0-9+.-]*://', ''), '^.*@', ''),
        '/', 1),
      '([:?#].*$)', '')
    ~ '^((www|m|mobile)\.)?([a-z0-9-]+\.)*(facebook\.com|fb\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|linktr\.ee|business\.site)$',
    false)
$$;

do $$
begin
  -- Sem "Lead editado" na linha do tempo: é uma correção de dados.
  perform set_config('vnd.skip_update_log', '1', true);

  update public.leads
     set source_url = website, website = null
   where public.vnd_is_social_url(website)
     and nullif(btrim(source_url), '') is null;

  update public.leads
     set website = null
   where public.vnd_is_social_url(website)
     and public.vnd_website_key(source_url) = public.vnd_website_key(website);

  update public.leads
     set notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'Rede social: ' || website),
         website = null
   where public.vnd_is_social_url(website);

  perform set_config('vnd.skip_update_log', '', true);
end
$$;

delete from public.site_monitors where public.vnd_is_social_url(url) or public.vnd_is_directory_url(url);
