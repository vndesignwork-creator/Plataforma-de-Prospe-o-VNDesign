-- =============================================================================
-- Scripts de contacto por categoria de serviço
--  - contact_templates.category: o modelo é sugerido primeiro aos leads com
--    serviços dessa categoria (vazio = todas as categorias).
--  - services.value_phrase: "frase de valor" de cada serviço, usada na variável
--    {{beneficio}} (completa "Posso ajudar-vos a ter …").
--  - Os modelos de origem que falam de sites passam a Web Design; acrescentam-se
--    modelos de Design Gráfico e modelos genéricos (sem alterar os existentes).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Frase de valor dos serviços
-- -----------------------------------------------------------------------------
alter table public.services
  add column value_phrase text check (value_phrase is null or length(btrim(value_phrase)) between 1 and 300);

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
  end
$$;

update public.services
set value_phrase = public.vnd_default_value_phrase(key)
where value_phrase is null and public.vnd_default_value_phrase(key) is not null;

-- Workspaces novos: os serviços de origem já com a frase.
create or replace function public.seed_services(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.services (workspace_id, key, label, short_label, category, icon, sort_order, value_phrase)
  select p_workspace_id, s.key, s.label, s.short_label, s.category, s.icon, s.sort_order, public.vnd_default_value_phrase(s.key)
  from (
    values
      ('landing_page', 'Landing Pages', 'Landing', 'web', 'layout', 1),
      ('site_institucional', 'Sites Institucionais', 'Site', 'web', 'building', 2),
      ('blog', 'Blogs Personalizados', 'Blog', 'web', 'newspaper', 3),
      ('loja_online', 'Pequenas Lojas', 'Loja', 'web', 'cart', 4),
      ('identidade_visual', 'Identidade Visual', 'Identidade', 'grafico', 'pen', 5),
      ('flyers_cartazes', 'Flyers e Cartazes', 'Flyers', 'grafico', 'file-image', 6),
      ('posts_redes', 'Posts Rede Social', 'Posts', 'grafico', 'images', 7),
      ('estampas', 'Estampas T-shirts', 'T-shirts', 'grafico', 'shirt', 8)
  ) as s(key, label, short_label, category, icon, sort_order)
  on conflict (workspace_id, key) do nothing
$$;
revoke execute on function public.seed_services(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Categoria dos modelos (apagar a categoria → o modelo passa a "todas")
-- -----------------------------------------------------------------------------
alter table public.contact_templates
  add column category text,
  add constraint contact_templates_category_fkey foreign key (workspace_id, category)
    references public.service_categories (workspace_id, key) on delete set null (category);
create index contact_templates_category_idx on public.contact_templates (workspace_id, category);

-- -----------------------------------------------------------------------------
-- Modelos por categoria, uma vez por workspace:
--  - os de origem que falam de sites passam a Web Design (só se ainda não
--    tiverem categoria; o texto não muda);
--  - acrescentam-se os de Design Gráfico e os genéricos (todas as categorias).
-- -----------------------------------------------------------------------------
create or replace function public.seed_category_templates(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order integer;
  v_grafico boolean;
begin
  select coalesce(max(sort_order), 0) into v_order from public.contact_templates where workspace_id = p_workspace_id;
  select exists (select 1 from public.service_categories where workspace_id = p_workspace_id and key = 'grafico') into v_grafico;

  if exists (select 1 from public.service_categories where workspace_id = p_workspace_id and key = 'web') then
    update public.contact_templates
    set category = 'web'
    where workspace_id = p_workspace_id
      and category is null
      and name in (
        'Email de prospeção — modelo VNDesign',
        'Email frio — diagnóstico',
        'Follow-up (3 dias sem resposta)',
        'Guião de chamada',
        'DM Instagram / Facebook',
        'Mensagem curta (LinkedIn / WhatsApp)',
        'Email geral — proposta de website',
        'Estrutura de proposta'
      );
  end if;

  insert into public.contact_templates (workspace_id, kind, name, subject, body, category, is_default, sort_order)
  select p_workspace_id, t.kind::public.template_kind, t.name, t.subject, t.body, t.category, false, v_order + t.n
  from (
    values
      (1, 'cold_email', 'Email de prospeção — Design Gráfico', 'grafico',
       'Uma ideia para a imagem da {{empresa}}',
       E'Boa tarde,\n\nO meu nome é {{meu_nome}} e sou designer gráfico freelancer aqui na Amadora (VNDesign).\n\nEstive a ver a comunicação da {{empresa}} (redes sociais, montra e materiais) e acredito que há espaço para {{beneficio|uma imagem mais forte e consistente}}.\n\n{{angulo}}\n\nTrabalho em {{servicos|identidade visual e materiais de comunicação}} para negócios de {{setor|vários setores}}. Se fizer sentido, envio 2 ou 3 exemplos de trabalhos parecidos, sem compromisso.\n\nPortfólio: {{portfolio}}\n\nCumprimentos,\n{{assinatura}}\n\n{{opt_out}}'),
      (2, 'follow_up', 'Follow-up — Design Gráfico', 'grafico',
       'Re: Uma ideia para a imagem da {{empresa}}',
       E'Olá {{contacto}},\n\nSó a confirmar se recebeu o meu email de {{data}}. Separei alguns exemplos de {{servicos|trabalhos de design}} que fiz para outros negócios; leva 1 minuto a ver.\n\nPosso enviar?\n\nCumprimentos,\n{{meu_nome}}\n\n{{opt_out}}'),
      (3, 'social_dm', 'DM Instagram / Facebook — Design Gráfico', 'grafico', null,
       E'Olá! Vi o vosso perfil e gosto muito do que fazem 🙌 Sou designer gráfico na Amadora e trabalho em {{servicos|identidade visual, posts e flyers}} para negócios de {{setor|vários setores}}. Acho que vos podia ajudar a ter {{beneficio|uma imagem ainda mais forte}}. Posso enviar alguns exemplos?'),
      (4, 'call_script', 'Guião de chamada — Design Gráfico', 'grafico', null,
       E'ABERTURA\n"Bom dia, falo com o/a responsável pela imagem / comunicação da {{empresa}}?"\n\nPROPOSTA\n"Chamo-me {{meu_nome}}, sou designer gráfico aqui na zona. Trabalho em {{servicos|identidade visual e materiais de comunicação}} para negócios de {{setor|vários setores}} e tive uma ideia para vos ajudar a ter {{beneficio|uma imagem mais forte}}. Posso enviar 2 ou 3 exemplos por email?"\n\nSE SIM\nRecolher o email e enviar os exemplos no mesmo dia.\n\nSE NÃO\n"Percebo. Posso deixar o meu contacto para quando precisarem de materiais novos?"\n\nOBJEÇÃO: "JÁ TEMOS QUEM FAÇA"\n"Ótimo! Se um dia precisarem de uma segunda opinião ou de resposta rápida, fico à disposição. Posso enviar o portfólio só para ficarem com ele?"'),
      (5, 'cold_email', 'Email de prospeção — genérico', null,
       'Uma ideia para a {{empresa}}',
       E'Boa tarde,\n\nO meu nome é {{meu_nome}} e sou designer freelancer aqui na Amadora (VNDesign).\n\nEstive a ver a presença da {{empresa}} e acredito que vos posso ajudar a ter {{beneficio|uma imagem mais forte e profissional}}.\n\n{{angulo}}\n\nTrabalho em {{servicos|design gráfico e web design}} para negócios de {{setor|vários setores}}. Se fizer sentido, envio uma proposta rápida ou alguns exemplos, sem compromisso.\n\nPortfólio: {{portfolio}}\n\nCumprimentos,\n{{assinatura}}\n\n{{opt_out}}'),
      (6, 'follow_up', 'Follow-up — genérico', null,
       'Re: Uma ideia para a {{empresa}}',
       E'Olá {{contacto}},\n\nSó a confirmar se recebeu o meu email de {{data}} sobre {{servicos|a vossa imagem}}. Posso enviar alguns exemplos ou uma proposta rápida?\n\nCumprimentos,\n{{meu_nome}}\n\n{{opt_out}}'),
      (7, 'short_message', 'Mensagem curta — genérica', null,
       'Proposta de {{categoria|design}} (freelancer na Amadora)',
       E'Olá {{contacto}},\n\nO meu nome é {{meu_nome}}, sou designer freelancer na Amadora. Trabalho em {{servicos|design gráfico e web design}} e acredito que posso ajudar a {{empresa}} a ter {{beneficio|uma imagem mais forte}}.\n\nSe fizer sentido, envio uma proposta rápida com algumas ideias.\n\nCumprimentos,\n{{meu_nome}}')
  ) as t(n, kind, name, category, subject, body)
  where (t.category is null or v_grafico)
    and not exists (
      select 1 from public.contact_templates c where c.workspace_id = p_workspace_id and c.name = t.name
    );
end
$$;
revoke execute on function public.seed_category_templates(uuid) from public, anon, authenticated;

select public.seed_category_templates(id) from public.workspaces;

-- Conta nova: corre depois de on_auth_user_created (os triggers correm por ordem
-- do nome), quando o workspace já tem as categorias e os modelos de origem.
create or replace function public.vnd_seed_category_templates_for_new_user()
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
    perform public.seed_category_templates(v_workspace_id);
  end if;
  return new;
end
$$;
revoke execute on function public.vnd_seed_category_templates_for_new_user() from public, anon, authenticated;
create trigger on_auth_user_created_templates
  after insert on auth.users
  for each row execute function public.vnd_seed_category_templates_for_new_user();
