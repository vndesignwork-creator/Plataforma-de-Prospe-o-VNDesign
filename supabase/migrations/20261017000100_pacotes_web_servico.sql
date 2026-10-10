-- =============================================================================
-- Pacotes de Web Design em workspaces novos: associar ao serviço
--  A migração *_servicos_design_grafico.sql associou Essencial → Landing Pages e
--  Profissional/Premium → Sites Institucionais só nos workspaces que já
--  existiam; nos criados depois, os pacotes web ficavam sem serviço e a nova
--  proposta não sugeria o pacote certo para o lead.
-- =============================================================================

create or replace function public.vnd_workspaces_seed_packages()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.seed_service_packages(new.id);
  update public.service_packages set service = 'landing_page'
   where workspace_id = new.id and name = 'Essencial' and service is null;
  update public.service_packages set service = 'site_institucional'
   where workspace_id = new.id and name in ('Profissional', 'Premium') and service is null;
  perform public.seed_graphic_packages(new.id);
  return new;
end
$$;

-- Workspaces criados entretanto.
update public.service_packages set service = 'landing_page'
 where category = 'web' and name = 'Essencial' and service is null;
update public.service_packages set service = 'site_institucional'
 where category = 'web' and name in ('Profissional', 'Premium') and service is null;
