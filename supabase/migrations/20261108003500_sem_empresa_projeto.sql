-- =============================================================================
-- Empresa à parte do nome do projeto:
--  * "Sem empresa" (no_company): o lead é uma pessoa. O nome que o identifica
--    (company_name, usado em listas, emails e PDFs) passa a ser o da pessoa de
--    contacto e acompanha-o quando muda.
--  * O registo principal de um cliente pode ter nome de projeto (project_title),
--    como os projetos novos. Os projetos novos copiam a empresa do principal e
--    passam a acompanhá-la quando se corrige no principal.
-- =============================================================================

alter table public.leads add column if not exists no_company boolean not null default false;
comment on column public.leads.no_company is 'Sem empresa: o nome do lead é o da pessoa de contacto.';

-- Sem empresa: o nome do lead é o da pessoa de contacto (antes dos outros gatilhos de normalização,
-- que correm por ordem do nome: "leads_a…" vem primeiro).
create or replace function public.vnd_leads_no_company_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.no_company and length(btrim(coalesce(new.contact_name, ''))) > 0 then
    new.company_name := left(btrim(new.contact_name), 300);
  end if;
  return new;
end
$$;
drop trigger if exists leads_a_no_company_name on public.leads;
create trigger leads_a_no_company_name before insert or update of no_company, contact_name, company_name on public.leads
  for each row execute function public.vnd_leads_no_company_name();

-- Corrigir a empresa no registo principal corrige-a nos projetos novos desse cliente.
create or replace function public.vnd_leads_sync_client_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := coalesce(current_setting('vnd.skip_update_log', true), '0');
begin
  if new.client_of is null
     and (new.company_name is distinct from old.company_name or new.no_company is distinct from old.no_company) then
    -- Sem "Lead editado" a mais nos projetos (a alteração foi no principal).
    perform set_config('vnd.skip_update_log', '1', true);
    update public.leads
       set company_name = new.company_name, no_company = new.no_company
     where client_of = new.id and workspace_id = new.workspace_id
       and (company_name is distinct from new.company_name or no_company is distinct from new.no_company);
    perform set_config('vnd.skip_update_log', v_prev, true);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_leads_sync_client_company() from public, anon, authenticated;
drop trigger if exists leads_sync_client_company on public.leads;
create trigger leads_sync_client_company after update of company_name, no_company on public.leads
  for each row execute function public.vnd_leads_sync_client_company();
