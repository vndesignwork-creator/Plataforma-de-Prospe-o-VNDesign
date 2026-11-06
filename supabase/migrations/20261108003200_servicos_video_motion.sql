-- =============================================================================
-- Vídeo e Motion Design: mais serviços e pacotes prontos (preços para ajustar).
-- Usa a categoria que já existe com "vídeo" ou "motion" no nome (ex.: "Vídeo e
-- Motion Design"); se não houver, cria-a. Não duplica nada: um serviço parecido
-- que já exista (ex.: "Motion Design") é reaproveitado e os pacotes ligam-se a ele.
-- Workspaces existentes e contas novas. Também liga as listas de tarefas
-- "Motion design" e "Edição de vídeo" (sem serviço) ao serviço certo.
-- =============================================================================

create or replace function public.seed_video_motion_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_order integer;
  v_key text;
  v_map jsonb := '{}'::jsonb;
  s record;
  p record;
begin
  -- 1) A categoria.
  select key into v_category from public.service_categories
   where workspace_id = p_workspace_id
     and (label ~* 'v[íi]deo|motion' or key ~* 'video|motion')
   order by sort_order limit 1;
  if v_category is null then
    v_category := 'video_motion';
    if exists (select 1 from public.service_categories where workspace_id = p_workspace_id and key = v_category) then
      return;
    end if;
    insert into public.service_categories (workspace_id, key, label, icon, sort_order)
    values (p_workspace_id, v_category, 'Vídeo e Motion Design', 'video',
            (select coalesce(max(sort_order), 0) + 1 from public.service_categories where workspace_id = p_workspace_id));
  end if;

  -- 2) Os serviços (pat_a e, se houver, pat_b têm de aparecer no nome de um serviço parecido).
  for s in
    select * from (values
      (1, 'motion_design', 'Motion Design', 'Motion', 'sparkles',
       'animações que explicam o vosso serviço em poucos segundos e prendem a atenção', 14, 2, 'motion', null),
      (2, 'edicao_video', 'Edição de Vídeo', 'Edição vídeo', 'video',
       'vídeos bem montados, com legendas e som cuidado, prontos a publicar', 5, 2, 'edi[çc][ãa]o|montagem', 'v[íi]deo'),
      (3, 'reels', 'Reels e Vídeos Curtos', 'Reels', 'smartphone',
       'vídeos curtos para o Instagram e o TikTok que chegam a mais clientes', 7, 1, 'reels|tiktok|shorts|v[íi]deos? curtos', null),
      (4, 'video_institucional', 'Vídeo Institucional', 'Institucional', 'camera',
       'um vídeo que apresenta a empresa e passa confiança a quem visita o site', 21, 2, 'institucional|corporativo|apresenta', 'v[íi]deo'),
      (5, 'animacao_logotipo', 'Animação de Logótipo', 'Logo animado', 'pen',
       'o logótipo animado para abrir e fechar os vídeos e as redes sociais', 5, 2, 'anima', 'log[óo]|marca')
    ) as t(n, key, label, short_label, icon, phrase, days, revisions, pat_a, pat_b)
    order by n
  loop
    select key into v_key from public.services
     where workspace_id = p_workspace_id and archived_at is null
       and (key = s.key or (label ~* s.pat_a and (s.pat_b is null or label ~* s.pat_b)))
     order by (key = s.key) desc, sort_order limit 1;
    if v_key is null then
      if exists (select 1 from public.services where workspace_id = p_workspace_id and key = s.key) then
        continue; -- arquivado: fica como o utilizador o deixou.
      end if;
      select coalesce(max(sort_order), 0) + 1 into v_order from public.services where workspace_id = p_workspace_id;
      insert into public.services
        (workspace_id, key, label, short_label, category, icon, sort_order, value_phrase, delivery_days, revisions_included)
      values (p_workspace_id, s.key, s.label, s.short_label, v_category, s.icon, v_order, s.phrase, s.days, s.revisions);
      v_key := s.key;
    end if;
    v_map := v_map || jsonb_build_object(s.key, v_key);
  end loop;

  -- 3) Os pacotes (pela ordem; um nome que já exista não se repete).
  select coalesce(max(sort_order), 0) into v_order from public.service_packages where workspace_id = p_workspace_id;
  for p in
    select * from (values
      (1, 'Animação de logótipo', 'O logótipo animado, com som, para abrir e fechar vídeos e publicações.', 150, 5, false, 'animacao_logotipo',
       array['Animação de 3 a 5 segundos', 'Som ou efeito sonoro (com licença)', 'Versão com fundo e sem fundo', 'Formatos 16:9, 9:16 e 1:1', '2 revisões']),
      (2, 'Edição de vídeo (até 3 min)', 'Montagem do vosso material, pronta a publicar.', 180, 5, false, 'edicao_video',
       array['Cortes e montagem', 'Correção de cor e de áudio', 'Legendas e textos no ecrã', 'Música com licença', '2 revisões', 'Formatos 16:9 e 9:16']),
      (3, 'Reels — pack de 4', '4 vídeos curtos para o Instagram, o TikTok e os Shorts do YouTube.', 240, 7, false, 'reels',
       array['4 vídeos até 30 segundos', 'Legendas animadas', 'Música e sons em tendência (com licença)', 'Capa para cada vídeo', '1 revisão por vídeo']),
      (4, 'Motion design (até 30 s)', 'Uma animação que explica o serviço ou o produto em poucos segundos.', 350, 14, true, 'motion_design',
       array['Guião e storyboard', 'Animação até 30 segundos', 'Música e sons (com licença)', 'Formatos 16:9, 9:16 e 1:1', '2 revisões']),
      (5, 'Vídeo institucional', 'Um vídeo de 1 a 2 minutos que apresenta a empresa, a equipa e o espaço.', 650, 21, false, 'video_institucional',
       array['Guião e plano de filmagem', 'Meio dia de filmagem', 'Edição, cor e som', 'Legendas', 'Versão curta de 30 s para as redes', '2 revisões']),
      (6, 'Edição de vídeo — mensal', 'Todos os meses: 8 vídeos curtos editados a partir do vosso material.', 420, null, false, 'reels',
       array['8 vídeos curtos por mês', 'Legendas animadas', 'Calendário de publicação', 'Capas para os vídeos', 'Relatório simples no fim do mês'])
    ) as t(n, name, description, price, days, recommended, service, features)
    order by n
  loop
    v_key := v_map ->> p.service;
    if v_key is null
       or exists (select 1 from public.service_packages where workspace_id = p_workspace_id and lower(btrim(name)) = lower(p.name)) then
      continue;
    end if;
    v_order := v_order + 1;
    insert into public.service_packages
      (workspace_id, name, description, price, features, delivery_days, recommended, sort_order, category, service)
    values (p_workspace_id, p.name, p.description, p.price, p.features, p.days, p.recommended, v_order,
            (select category from public.services where workspace_id = p_workspace_id and key = v_key), v_key);
  end loop;

  -- 4) As listas de tarefas de motion e vídeo (sem serviço) passam a ter o serviço.
  update public.task_templates set service = v_map ->> 'motion_design'
   where workspace_id = p_workspace_id and service is null and lower(name) = lower('Motion design') and v_map ? 'motion_design';
  update public.task_templates set service = v_map ->> 'edicao_video'
   where workspace_id = p_workspace_id and service is null and lower(name) = lower('Edição de vídeo') and v_map ? 'edicao_video';
end
$$;
revoke execute on function public.seed_video_motion_services(uuid) from public, anon, authenticated;

select public.seed_video_motion_services(id) from public.workspaces;

-- Conta nova: depois das categorias e dos outros serviços (os triggers correm por ordem do nome).
create or replace function public.vnd_seed_video_motion_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select m.workspace_id into v_workspace_id
  from public.workspace_members m
  where m.user_id = new.id and m.role = 'owner'
  order by m.created_at desc
  limit 1;
  if v_workspace_id is not null then
    perform public.seed_video_motion_services(v_workspace_id);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_seed_video_motion_for_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_templates_video on auth.users;
create trigger on_auth_user_created_templates_video
  after insert on auth.users
  for each row execute function public.vnd_seed_video_motion_for_new_user();
