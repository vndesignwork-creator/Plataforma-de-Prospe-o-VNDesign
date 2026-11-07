-- =============================================================================
-- Apagar o primeiro projeto de um cliente (desde que fique outro): o projeto que
-- fica passa a ser o principal e herda o que é do cliente/lead — a linha do tempo,
-- as análises do site, as reuniões, os emails, o kit da marca, os acessos, as notas,
-- as etiquetas e os campos personalizados. O que é do projeto apagado (tarefas,
-- pagamentos, horas, entregas, contratos, propostas…) vai com ele para a reciclagem.
-- =============================================================================

create or replace function public.delete_first_client_project(p_main_id uuid, p_keep_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_main public.leads;
  v_keep public.leads;
begin
  select * into v_main from public.leads where id = p_main_id for update;
  if not found or v_main.client_of is not null then
    raise exception using errcode = 'P0002', message = 'Primeiro projeto não encontrado.';
  end if;
  if not public.is_workspace_staff(v_main.workspace_id) then
    raise exception using errcode = '42501', message = 'Só o dono ou um administrador pode apagar projetos.';
  end if;
  select * into v_keep from public.leads where id = p_keep_id and client_of = p_main_id and workspace_id = v_main.workspace_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Escolhe um projeto deste cliente para ficar.';
  end if;

  perform set_config('vnd.skip_update_log', '1', true);

  -- O projeto que fica passa a ser o principal; os outros passam a apontar para ele.
  update public.leads set client_of = null where id = v_keep.id;
  update public.leads set client_of = v_keep.id where client_of = v_main.id and id <> v_keep.id;

  -- O que é do cliente (não do projeto) passa para o principal novo.
  update public.leads set
    notes = case
      when v_main.notes is null or btrim(v_main.notes) = '' then notes
      when notes is null or btrim(notes) = '' then v_main.notes
      else notes || E'\n\n' || v_main.notes end,
    tags = (select coalesce(array_agg(distinct t), '{}') from unnest(coalesce(tags, '{}') || coalesce(v_main.tags, '{}')) t),
    custom = coalesce(v_main.custom, '{}'::jsonb) || coalesce(custom, '{}'::jsonb),
    pinned_note = coalesce(pinned_note, v_main.pinned_note),
    sector_id = coalesce(sector_id, v_main.sector_id),
    source_url = coalesce(source_url, v_main.source_url),
    approach_angle = coalesce(approach_angle, v_main.approach_angle),
    assigned_to = coalesce(assigned_to, v_main.assigned_to),
    first_contact_on = least(first_contact_on, v_main.first_contact_on)
  where id = v_keep.id;

  update public.lead_activities set lead_id = v_keep.id where lead_id = v_main.id;
  update public.site_audits set lead_id = v_keep.id where lead_id = v_main.id;
  update public.lead_meetings set lead_id = v_keep.id where lead_id = v_main.id;
  update public.email_tracking set lead_id = v_keep.id where lead_id = v_main.id;
  update public.ai_visibility_checks set lead_id = v_keep.id where lead_id = v_main.id;
  update public.lead_accesses set lead_id = v_keep.id where lead_id = v_main.id;
  if not exists (select 1 from public.lead_brand_kits where lead_id = v_keep.id) then
    update public.lead_brand_kits set lead_id = v_keep.id where lead_id = v_main.id;
  end if;
  if not exists (select 1 from public.lead_geo where lead_id = v_keep.id) then
    update public.lead_geo set lead_id = v_keep.id where lead_id = v_main.id;
  end if;
  if not exists (select 1 from public.lead_sequence_state where lead_id = v_keep.id) then
    update public.lead_sequence_state set lead_id = v_keep.id where lead_id = v_main.id;
  end if;

  perform set_config('vnd.skip_update_log', '0', true);

  -- O primeiro projeto (já sem o que era do cliente) vai para a reciclagem.
  perform public.trash_leads(v_main.workspace_id, array[v_main.id]);

  insert into public.lead_activities (workspace_id, lead_id, type, body, payload, actor_user_id)
  values (v_main.workspace_id, v_keep.id, 'note',
          'Primeiro projeto apagado (#' || v_main.number || '): este passou a ser o principal do cliente.',
          jsonb_build_object('via', 'client_project', 'deleted_project', v_main.number), auth.uid());
  return v_keep.id;
end
$$;
revoke execute on function public.delete_first_client_project(uuid, uuid) from public, anon;
grant execute on function public.delete_first_client_project(uuid, uuid) to authenticated;
