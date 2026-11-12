-- =============================================================================
-- Sites onde está instalado o plugin "Análise grátis" (WordPress) e com que
-- versão: o plugin pede a configuração à plataforma (o WordPress diz o endereço
-- do site no User-Agent; a partir da 1.9.0 o plugin diz também a versão).
-- Serve para avisar em Definições quando o plugin do site está desatualizado.
-- Escrito só pelo servidor (service role); os membros leem.
-- =============================================================================
create table if not exists public.free_audit_plugin_sites (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  site text not null check (char_length(site) between 4 and 300),
  version text check (version is null or version ~ '^\d{1,3}(\.\d{1,3}){1,2}$'),
  seen_at timestamptz not null default now(),
  primary key (workspace_id, site)
);
comment on table public.free_audit_plugin_sites is 'Sites com o plugin de WordPress da análise grátis (versão = null: anterior à 1.9.0).';

alter table public.free_audit_plugin_sites enable row level security;
drop policy if exists free_audit_plugin_sites_member_select on public.free_audit_plugin_sites;
create policy free_audit_plugin_sites_member_select on public.free_audit_plugin_sites for select to authenticated
  using (public.is_workspace_member(workspace_id));
