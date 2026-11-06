-- Listas de tarefas (Definições → Listas de tarefas): Motion design e Edição de vídeo.
-- Ligam-se ao serviço do workspace com esse nome, se existir (ex.: "Motion"); senão ficam
-- sem serviço (aplicam-se à mão em qualquer projeto). Não duplica se já houver uma com o mesmo nome.

create or replace function public.seed_task_templates_motion_video(p_workspace_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order int;
  v_motion text;
  v_video text;
begin
  select coalesce(max(sort_order), 0) into v_order from public.task_templates where workspace_id = p_workspace_id;

  select key into v_motion from public.services
    where workspace_id = p_workspace_id and archived_at is null
      and (key ilike '%motion%' or label ilike '%motion%' or label ilike '%anima%')
    order by sort_order limit 1;
  select key into v_video from public.services
    where workspace_id = p_workspace_id and archived_at is null
      and (key ilike '%video%' or label ilike '%vídeo%' or label ilike '%video%')
      and key is distinct from v_motion
    order by sort_order limit 1;

  if not exists (select 1 from public.task_templates where workspace_id = p_workspace_id and lower(name) = lower('Motion design')) then
    insert into public.task_templates (workspace_id, name, service, items, sort_order) values
    (p_workspace_id, 'Motion design', v_motion, array[
      'Briefing (objetivo, duração, formato e onde vai ser publicado)',
      'Receber o logótipo, as cores, as letras e os materiais',
      'Guião e mensagem principal',
      'Storyboard (esboço das cenas)',
      'Aprovação do storyboard',
      'Escolher a música e os sons (com licença)',
      'Animação: primeira versão',
      'Revisão do cliente',
      'Ajustes e versão final',
      'Exportar nos formatos (16:9, 9:16 e 1:1)',
      'Entregar os ficheiros',
      'Enviar a fatura'
    ], v_order + 1);
  end if;

  if not exists (select 1 from public.task_templates where workspace_id = p_workspace_id and lower(name) = lower('Edição de vídeo')) then
    insert into public.task_templates (workspace_id, name, service, items, sort_order) values
    (p_workspace_id, 'Edição de vídeo', v_video, array[
      'Briefing (objetivo, duração, formato e plataforma)',
      'Receber o material em bruto (vídeos, fotografias e áudio)',
      'Ver e organizar o material',
      'Guião ou estrutura do vídeo',
      'Primeira montagem (cortes)',
      'Correção de cor e de áudio',
      'Legendas e textos no ecrã',
      'Música e sons (com licença)',
      'Revisão do cliente',
      'Ajustes e versão final',
      'Exportar nos formatos (16:9, 9:16 e 1:1)',
      'Entregar os ficheiros',
      'Enviar a fatura'
    ], v_order + 2);
  end if;
end
$$;
revoke execute on function public.seed_task_templates_motion_video(uuid) from public, anon, authenticated;

-- Os workspaces que já existem.
do $$
declare
  w record;
begin
  for w in select id from public.workspaces loop
    perform public.seed_task_templates_motion_video(w.id);
  end loop;
end
$$;

-- Os novos (depois das listas de origem).
create or replace function public.vnd_workspaces_seed_task_templates_motion_video()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.seed_task_templates_motion_video(new.id);
  return new;
end
$$;
drop trigger if exists workspaces_seed_task_templates_motion_video on public.workspaces;
create trigger workspaces_seed_task_templates_motion_video after insert on public.workspaces
  for each row execute function public.vnd_workspaces_seed_task_templates_motion_video();
