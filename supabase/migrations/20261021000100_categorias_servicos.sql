-- =============================================================================
-- Categorias de serviços geríveis (Definições → Serviços → Categorias)
--  - Tabela service_categories por workspace: nome, ícone, ordem e se o email
--    com IA usa o portefólio de design gráfico.
--  - As 3 de origem (web, grafico, outros) mantêm as chaves; services.category e
--    service_packages.category passam a ser validadas por trigger.
-- =============================================================================

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,48}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  icon text check (icon is null or icon ~ '^[a-z0-9-]{1,32}$'),
  design_portfolio boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create unique index service_categories_label_uq on public.service_categories (workspace_id, lower(btrim(label)));
create index service_categories_ws_idx on public.service_categories (workspace_id, sort_order);
create trigger service_categories_touch before update on public.service_categories
  for each row execute function public.vnd_touch_updated_at();
alter table public.service_categories enable row level security;
create policy service_categories_member_all on public.service_categories for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- A chave não muda (está guardada nos serviços e nos pacotes).
create trigger service_categories_key_immutable before update of key on public.service_categories
  for each row execute function public.vnd_services_key_immutable();

create or replace function public.seed_service_categories(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.service_categories (workspace_id, key, label, icon, design_portfolio, sort_order)
  values
    (p_workspace_id, 'web', 'Web Design', 'monitor', false, 1),
    (p_workspace_id, 'grafico', 'Design Gráfico', 'palette', true, 2),
    (p_workspace_id, 'outros', 'Outros serviços', 'grid', false, 3)
  on conflict (workspace_id, key) do nothing
$$;
revoke execute on function public.seed_service_categories(uuid) from public, anon, authenticated;

-- Num workspace novo, a ordem conta (os triggers correm por ordem alfabética do nome):
-- categorias → serviços → pacotes (workspaces_seed_packages) → listas de tarefas.
create or replace function public.vnd_workspaces_seed_service_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_service_categories(new.id);
  return new;
end
$$;
create trigger workspaces_seed_0_categories after insert on public.workspaces
  for each row execute function public.vnd_workspaces_seed_service_categories();
drop trigger if exists workspaces_seed_services on public.workspaces;
create trigger workspaces_seed_1_services after insert on public.workspaces
  for each row execute function public.vnd_workspaces_seed_services();

select public.seed_service_categories(id) from public.workspaces;

-- -----------------------------------------------------------------------------
-- Validação da categoria (em vez da lista fixa)
-- -----------------------------------------------------------------------------
alter table public.services drop constraint if exists services_category_check;
alter table public.service_packages drop constraint if exists service_packages_category_check;

create or replace function public.vnd_check_row_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.service_categories c where c.workspace_id = new.workspace_id and c.key = new.category
  ) then
    raise exception 'Categoria desconhecida: %', new.category using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger services_check_category before insert or update of category on public.services
  for each row execute function public.vnd_check_row_category();
create trigger service_packages_check_category before insert or update of category on public.service_packages
  for each row execute function public.vnd_check_row_category();

-- Apagar uma categoria só vazia (sem serviços nem pacotes).
create or replace function public.vnd_service_categories_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.services s where s.workspace_id = old.workspace_id and s.category = old.key)
     or exists (select 1 from public.service_packages p where p.workspace_id = old.workspace_id and p.category = old.key) then
    raise exception 'A categoria tem serviços ou pacotes: muda-os de categoria primeiro.' using errcode = '23503';
  end if;
  return old;
end
$$;
create trigger service_categories_before_delete before delete on public.service_categories
  for each row execute function public.vnd_service_categories_before_delete();
