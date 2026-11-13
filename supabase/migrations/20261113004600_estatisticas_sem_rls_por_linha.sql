-- =============================================================================
-- Estatísticas mais rápidas: estas funções de números corriam com as regras de acesso (RLS)
-- verificadas linha a linha (com milhares de leads, 2 a 8× mais lentas). Passam a verificar
-- UMA vez, no início, se quem pede é da equipa deste workspace (ou é a própria plataforma,
-- com a chave de serviço), e depois contam sem repetir a verificação. Quem não é da equipa
-- continua a não ver nada (erro 42501).
--
-- Cada função original passa a "<nome>_unchecked" (sem acesso direto) e o nome de sempre é
-- agora a porta com a verificação: a API e as outras funções continuam a chamar o mesmo nome.
-- =============================================================================

create or replace function public.vnd_assert_workspace_access(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Sem acesso a este workspace' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.vnd_assert_workspace_access(uuid) from public, anon;
grant execute on function public.vnd_assert_workspace_access(uuid) to authenticated, service_role;

-- dashboard_summary ------------------------------------------------------------
alter function public.dashboard_summary(uuid, integer) rename to dashboard_summary_unchecked;
alter function public.dashboard_summary_unchecked(uuid, integer) security definer;
revoke all on function public.dashboard_summary_unchecked(uuid, integer) from public, anon, authenticated, service_role;
create or replace function public.dashboard_summary(p_workspace_id uuid, p_weeks integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.vnd_assert_workspace_access(p_workspace_id);
  return public.dashboard_summary_unchecked(p_workspace_id, p_weeks);
end;
$$;
grant execute on function public.dashboard_summary(uuid, integer) to authenticated, service_role;

-- stats_period -----------------------------------------------------------------
alter function public.stats_period(uuid, date, date) rename to stats_period_unchecked;
alter function public.stats_period_unchecked(uuid, date, date) security definer;
revoke all on function public.stats_period_unchecked(uuid, date, date) from public, anon, authenticated, service_role;
create or replace function public.stats_period(p_workspace_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.vnd_assert_workspace_access(p_workspace_id);
  v := public.stats_period_unchecked(p_workspace_id, p_from, p_to);
  -- Os pagamentos só os vê o dono e os administradores (como na regra de acesso de lead_payments).
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_workspace_staff(p_workspace_id) then
    v := v || jsonb_build_object('received', 0);
  end if;
  return v;
end;
$$;
grant execute on function public.stats_period(uuid, date, date) to authenticated, service_role;

-- goal_progress ----------------------------------------------------------------
alter function public.goal_progress(uuid, date, date, uuid) rename to goal_progress_unchecked;
alter function public.goal_progress_unchecked(uuid, date, date, uuid) security definer;
revoke all on function public.goal_progress_unchecked(uuid, date, date, uuid) from public, anon, authenticated, service_role;
create or replace function public.goal_progress(p_workspace_id uuid, p_from date, p_to date, p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.vnd_assert_workspace_access(p_workspace_id);
  return public.goal_progress_unchecked(p_workspace_id, p_from, p_to, p_user);
end;
$$;
grant execute on function public.goal_progress(uuid, date, date, uuid) to authenticated, service_role;

-- stats_by_origin --------------------------------------------------------------
alter function public.stats_by_origin(uuid) rename to stats_by_origin_unchecked;
alter function public.stats_by_origin_unchecked(uuid) security definer;
revoke all on function public.stats_by_origin_unchecked(uuid) from public, anon, authenticated, service_role;
create or replace function public.stats_by_origin(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.vnd_assert_workspace_access(p_workspace_id);
  return public.stats_by_origin_unchecked(p_workspace_id);
end;
$$;
grant execute on function public.stats_by_origin(uuid) to authenticated, service_role;

-- lead_city_counts -------------------------------------------------------------
alter function public.lead_city_counts(uuid) rename to lead_city_counts_unchecked;
alter function public.lead_city_counts_unchecked(uuid) security definer;
revoke all on function public.lead_city_counts_unchecked(uuid) from public, anon, authenticated, service_role;
create or replace function public.lead_city_counts(p_workspace_id uuid)
returns table (city text, count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.vnd_assert_workspace_access(p_workspace_id);
  return query select * from public.lead_city_counts_unchecked(p_workspace_id);
end;
$$;
grant execute on function public.lead_city_counts(uuid) to authenticated, service_role;
