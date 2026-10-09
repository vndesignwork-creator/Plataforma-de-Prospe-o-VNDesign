-- =============================================================================
-- VNDesign Leads — ícones de linha nos setores e links de diretórios no Website
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ícone de linha por setor (nomes da lista SECTOR_ICONS em packages/core/src/enums.ts)
-- -----------------------------------------------------------------------------
alter table public.sectors
  add column icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');

create or replace function public.vnd_sector_default_icon(p_slug text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_slug
    when 'restauracao' then 'utensils'
    when 'saude-clinica' then 'stethoscope'
    when 'imobiliaria' then 'house'
    when 'comercio-local' then 'shopping-bag'
    when 'advogados' then 'scale'
    when 'turismo' then 'hotel'
    when 'servicos-tecnicos' then 'wrench'
    when 'educacao-formacao' then 'graduation-cap'
    when 'outro' then 'briefcase'
  end
$$;

create or replace function public.vnd_sectors_default_icon()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.icon is null then
    new.icon := public.vnd_sector_default_icon(new.slug);
  end if;
  return new;
end
$$;
create trigger sectors_default_icon before insert on public.sectors
  for each row execute function public.vnd_sectors_default_icon();

update public.sectors set icon = public.vnd_sector_default_icon(slug) where icon is null;

-- -----------------------------------------------------------------------------
-- Diretórios/agregadores (TripAdvisor, Sluurpy, Google Maps…) não são o site da
-- empresa. Espelho de DIRECTORY_HOSTS em packages/core/src/links.ts.
-- -----------------------------------------------------------------------------
create or replace function public.vnd_is_directory_url(p text)
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
    ~ '^((www|m|mobile)\.)?([a-z0-9-]+\.)*(sluurpy\.[a-z.]+|restaurantguru\.[a-z.]+|wanderlog\.com|tripadvisor\.[a-z.]+|thefork\.[a-z.]+|zomato\.com|yelp\.[a-z.]+|paginasamarelas\.pt|zaask\.pt|fixando\.pt|guiadacidade\.pt|booking\.com|maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+)$',
    false)
$$;

-- Corrige os leads existentes: o link passa para "Fonte" (ou para as notas, se
-- a Fonte já tiver outro link) e o Website fica vazio. Sem "Lead editado".
do $$
begin
  perform set_config('vnd.skip_update_log', '1', true);

  update public.leads
     set source_url = website,
         website = null
   where public.vnd_is_directory_url(website)
     and nullif(btrim(source_url), '') is null;

  update public.leads
     set website = null
   where public.vnd_is_directory_url(website)
     and public.vnd_website_key(source_url) = public.vnd_website_key(website);

  update public.leads
     set notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'Link de diretório: ' || website),
         website = null
   where public.vnd_is_directory_url(website);

  perform set_config('vnd.skip_update_log', '', true);
end
$$;
