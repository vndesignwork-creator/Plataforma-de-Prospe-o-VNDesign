-- =============================================================================
-- GEO como serviço: "Otimização para IAs (GEO)" no catálogo (Web Design), com
-- frase de valor, 2 pacotes (preparação e acompanhamento mensal, preços para
-- ajustar) e scripts de contacto que usam {{visibilidade_ia}} (a frase do teste
-- "Aparece nas IAs?"). Workspaces existentes e novos; nada é substituído.
-- =============================================================================

create or replace function public.vnd_default_value_phrase(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'landing_page' then 'uma página focada que transforma visitas em pedidos de contacto'
    when 'site_institucional' then 'um site moderno e rápido que apresenta bem os vossos serviços'
    when 'blog' then 'um blog que vos ajuda a aparecer no Google e a ganhar a confiança dos clientes'
    when 'loja_online' then 'uma loja online simples para venderem também fora do horário'
    when 'identidade_visual' then 'uma imagem coerente que os clientes reconhecem à primeira vista'
    when 'flyers_cartazes' then 'flyers e cartazes que chamam a atenção e passam a mensagem num segundo'
    when 'posts_redes' then 'publicações com aspeto profissional e consistente nas redes sociais'
    when 'estampas' then 't-shirts e merchandising com a vossa marca, prontos a usar ou a vender'
    when 'geo' then 'aparecer quando os clientes pedem recomendações ao ChatGPT, ao Google e a outras IAs'
  end
$$;

-- -----------------------------------------------------------------------------
-- Serviço, pacotes e scripts GEO de um workspace (só o que ainda não existe).
-- -----------------------------------------------------------------------------
create or replace function public.seed_geo_service(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_order integer;
begin
  -- Na categoria Web Design (se existir), senão em "Outros serviços".
  select key into v_category from public.service_categories
   where workspace_id = p_workspace_id and key in ('web', 'outros')
   order by (key = 'web') desc limit 1;
  if v_category is null then
    return;
  end if;

  if not exists (select 1 from public.services where workspace_id = p_workspace_id and (key = 'geo' or lower(btrim(label)) = lower('Otimização para IAs (GEO)'))) then
    select coalesce(max(sort_order), 0) + 1 into v_order from public.services where workspace_id = p_workspace_id;
    insert into public.services (workspace_id, key, label, short_label, category, icon, sort_order, value_phrase)
    values (p_workspace_id, 'geo', 'Otimização para IAs (GEO)', 'GEO', v_category, 'search', v_order, public.vnd_default_value_phrase('geo'));
  end if;

  if exists (select 1 from public.services where workspace_id = p_workspace_id and key = 'geo')
     and not exists (select 1 from public.service_packages where workspace_id = p_workspace_id and service = 'geo') then
    select coalesce(max(sort_order), 0) into v_order from public.service_packages where workspace_id = p_workspace_id;
    insert into public.service_packages
      (workspace_id, name, description, price, features, delivery_days, recommended, sort_order, category, service)
    values
      (p_workspace_id, 'GEO — Preparar para as IAs', 'O site preparado para ser recomendado pelo ChatGPT, pelo Google e por outras IAs.', 190,
       array['Teste "Aparece nas IAs?" antes e depois', 'Dados estruturados do negócio (schema.org)', '8 a 10 perguntas frequentes no site',
             'Ficheiro llms.txt', 'Revisão do perfil do Google e das avaliações', 'Desbloquear os robôs das IAs (robots.txt)'],
       7, false, v_order + 1, v_category, 'geo'),
      (p_workspace_id, 'GEO — Acompanhamento mensal', 'Todos os meses: o teste nas IAs com as mesmas perguntas, o relatório e os ajustes.', 49,
       array['Teste mensal nas IAs (mesmas perguntas)', 'Relatório com a evolução e os concorrentes', 'Ajustes às perguntas frequentes e aos dados',
             'Pedido de avaliações aos clientes'],
       null, false, v_order + 2, v_category, 'geo');
  end if;

  insert into public.contact_templates (workspace_id, kind, name, subject, body, category, is_default, sort_order)
  select p_workspace_id, t.kind::public.template_kind, t.name, t.subject, t.body, v_category, false,
         (select coalesce(max(sort_order), 0) from public.contact_templates where workspace_id = p_workspace_id) + t.n
  from (
    values
      (1, 'cold_email', 'Email de prospeção — GEO (aparecer nas IAs)',
       'A {{empresa}} aparece quando pedem recomendações ao ChatGPT?',
       E'Boa tarde,\n\nO meu nome é {{meu_nome}} (VNDesign). Cada vez mais pessoas pedem recomendações ao ChatGPT ou ao Google em vez de pesquisarem — por isso fiz um teste rápido para a {{empresa}}.\n\n{{visibilidade_ia|Fiz as perguntas que um cliente faria e a vossa empresa não apareceu nas respostas.}}\n\nHá passos simples que ajudam: os dados do negócio num formato que as IAs entendem, perguntas frequentes no site e o perfil do Google bem cuidado.\n\nSe quiser, envio o relatório completo, com os concorrentes que aparecem no vosso lugar — sem compromisso.\n\nCumprimentos,\n{{assinatura}}\n\n{{opt_out}}'),
      (2, 'follow_up', 'Follow-up — GEO',
       'Re: A {{empresa}} aparece quando pedem recomendações ao ChatGPT?',
       E'Olá {{contacto}},\n\nSó a confirmar se recebeu o meu email de {{data}} sobre o teste nas IAs. Preparei um relatório curto com o que aparece hoje quando um cliente pede ao ChatGPT uma recomendação de {{setor|empresas}} em {{cidade|Portugal}}.\n\nPosso enviar?\n\nCumprimentos,\n{{meu_nome}}\n\n{{opt_out}}'),
      (3, 'short_message', 'Mensagem curta — GEO', null,
       E'Olá {{contacto}}! Sou {{meu_nome}}, da VNDesign. Fiz um teste rápido à presença da {{empresa}} nas IAs (ChatGPT, Google): {{visibilidade_ia|a vossa empresa não apareceu nas recomendações}}. Posso enviar-lhe o relatório, sem compromisso?'),
      (4, 'call_script', 'Guião de chamada — GEO', null,
       E'ABERTURA\n"Bom dia, falo com o/a responsável pela {{empresa}}?"\n\nPROPOSTA\n"Chamo-me {{meu_nome}}, sou da VNDesign. Hoje muitas pessoas pedem ao ChatGPT ou ao Google que lhes recomende um negócio. Fiz esse teste para a vossa zona e {{visibilidade_ia|a vossa empresa não apareceu nas respostas}}. Posso enviar-lhe o relatório por email?"\n\nSE SIM\nRecolher o email e enviar o relatório de diagnóstico (PDF) no mesmo dia.\n\nSE PERGUNTAR O QUE SE FAZ\n"Organizamos os dados do negócio para as IAs, juntamos perguntas frequentes ao site e cuidamos do perfil do Google. Depois repetimos o teste para ver a diferença."')
  ) as t(n, kind, name, subject, body)
  where not exists (select 1 from public.contact_templates c where c.workspace_id = p_workspace_id and c.name = t.name);
end
$$;
revoke execute on function public.seed_geo_service(uuid) from public, anon, authenticated;

select public.seed_geo_service(id) from public.workspaces;

-- Conta nova: depois dos modelos por categoria (os triggers correm por ordem do nome).
create or replace function public.vnd_seed_geo_for_new_user()
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
    perform public.seed_geo_service(v_workspace_id);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_seed_geo_for_new_user() from public, anon, authenticated;
create trigger on_auth_user_created_templates_geo
  after insert on auth.users
  for each row execute function public.vnd_seed_geo_for_new_user();
