-- =============================================================================
-- VNDesign Leads — criação automática do workspace e dados iniciais
-- Quando um utilizador é criado (npm run create-user ou painel do Supabase),
-- cria-se o workspace "VNDesign" com os setores, modelos de contacto e
-- ferramentas da folha "Leads_Prospeccao_VNDesign".
-- =============================================================================

create or replace function public.seed_workspace_defaults(p_workspace_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  -- ---------------------------------------------------------------------------
  -- Setores (emoji e nome iguais à folha; prioridade do separador
  -- "Sectores Oportunidades"). Os argumentos são um ponto de partida editável.
  -- ---------------------------------------------------------------------------
  insert into public.sectors (workspace_id, name, slug, emoji, sort_order, priority_rank, opportunity_notes, sales_arguments)
  values
    (p_workspace_id, 'Restauração', 'restauracao', '🍽️', 1, 2,
     'Restauração & Cafés — oportunidade n.º 2. Muitos restaurantes só têm Facebook ou plataformas de terceiros.',
     E'• Menu, horário e localização sempre atualizados num só sítio\n• Reservas e encomendas take-away sem comissões de plataformas\n• Aparecer no Google a quem procura "onde comer" na zona'),
    (p_workspace_id, 'Saúde / Clínica', 'saude-clinica', '🏥', 2, 3,
     'Saúde, Clínicas & Bem-estar — oportunidade n.º 3.',
     E'• Marcações online e menos chamadas para a receção\n• Confiança: equipa, especialidades e acordos visíveis\n• Site rápido e acessível para todas as idades'),
    (p_workspace_id, 'Imobiliária', 'imobiliaria', '🏠', 3, 5,
     'Imobiliárias — oportunidade n.º 5.',
     E'• Montra de imóveis própria, sem depender só dos portais\n• Captação de proprietários com formulário de avaliação\n• Marca local forte face às grandes redes'),
    (p_workspace_id, 'Comércio Local', 'comercio-local', '🛍️', 4, 4,
     'Comércio Local & PMEs de Serviços — oportunidade n.º 4.',
     E'• Horários, contactos e produtos encontráveis no Google\n• Catálogo simples ou loja online\n• Ligação direta a WhatsApp e redes sociais'),
    (p_workspace_id, 'Advogados', 'advogados', '⚖️', 5, 6,
     'Jurídico & Consultoria — oportunidade n.º 6.',
     E'• Credibilidade: áreas de prática, equipa e casos\n• Pedidos de contacto qualificados\n• Conteúdos que respondem às dúvidas dos clientes'),
    (p_workspace_id, 'Turismo', 'turismo', '🏨', 6, 1,
     'Turismo, Alojamento Local & Hotelaria — oportunidade n.º 1.',
     E'• Reservas diretas sem comissões das plataformas\n• Site bilingue para turistas\n• Fotografias e avaliações que convertem'),
    (p_workspace_id, 'Serviços Técnicos', 'servicos-tecnicos', '🔧', 7, 8,
     'Serviços Técnicos (construção, canalizadores, eletricistas) — oportunidade n.º 8.',
     E'• Pedidos de orçamento e reparação pelo site\n• Zona de atuação e serviços claros para o SEO local\n• Botão de chamada direta no telemóvel'),
    (p_workspace_id, 'Educação & Formação', 'educacao-formacao', '🎓', 8, 7,
     'Educação & Formação — oportunidade n.º 7.',
     E'• Cursos, horários e preços sempre atualizados\n• Inscrições online simples\n• Notícias e eventos fáceis de gerir pela equipa'),
    (p_workspace_id, 'Outro', 'outro', '💼', 9, null, null, null)
  on conflict (workspace_id, slug) do nothing;

  -- ---------------------------------------------------------------------------
  -- Modelos de contacto (separador "📝 Scripts de Contacto").
  -- Variáveis: {{empresa}} {{contacto}} {{setor}} {{cidade}} {{problema}}
  -- {{angulo}} {{website}} {{data}} {{meu_nome}} {{meu_telefone}} {{portfolio}}
  -- {{assinatura}} {{opt_out}}
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from public.contact_templates where workspace_id = p_workspace_id) then
    insert into public.contact_templates (workspace_id, kind, name, subject, body, is_default, sort_order)
    values
      (p_workspace_id, 'cold_email', 'Email de prospeção — modelo VNDesign',
       'Uma sugestão para o site da {{empresa}}',
       E'Boa tarde,\n\nO meu nome é {{meu_nome}} e sou web designer freelancer aqui na Amadora (VNDesign).\n\nEstive a ver a presença online da {{empresa}} e reparei que {{problema}}\n\n{{angulo}}\n\nSe fizer sentido, posso enviar uma proposta rápida, sem compromisso, ou passar aí para conversarmos 10 minutos.\n\nPortfólio: {{portfolio}}\n\nCumprimentos,\n{{assinatura}}\n\n{{opt_out}}',
       true, 1),
      (p_workspace_id, 'cold_email', 'Email frio — diagnóstico',
       'Encontrei um problema no site da {{empresa}}',
       E'Olá {{contacto}},\n\nVi o site da {{empresa}} e reparei que demora mais de [X] segundos a carregar no telemóvel — o que faz com que a maioria dos potenciais clientes saia antes de ver os vossos serviços.\n\nPosso enviar-vos um diagnóstico gratuito com os 3 problemas principais e como os resolver?\n\nCumprimentos,\n{{meu_nome}}  |  vndesign.pt  |  {{meu_telefone}}\n\n{{opt_out}}',
       false, 2),
      (p_workspace_id, 'follow_up', 'Follow-up (3 dias sem resposta)',
       'Re: Encontrei um problema no site da {{empresa}}',
       E'Olá {{contacto}},\n\nSó a verificar se recebeu o meu email de {{data}}. Preparei um relatório rápido com alguns pontos de melhoria para o vosso site — leva 2 minutos a ler.\n\nPosso enviar?\n\nCumprimentos,\n{{meu_nome}}\n\n{{opt_out}}',
       true, 3),
      (p_workspace_id, 'call_script', 'Guião de chamada', null,
       E'ABERTURA\n"Bom dia, falo com o/a responsável pelo site / marketing da {{empresa}}?"\n\nPROPOSTA\n"Chamo-me {{meu_nome}}, sou especialista em sites para {{setor}}. Vi o vosso site e tenho uma sugestão rápida que pode trazer mais clientes. Posso enviar um diagnóstico gratuito por email?"\n\nSE SIM\nRecolher email e enviar diagnóstico nas próximas 2 horas.\n\nSE NÃO\n"Percebo totalmente. Posso ligar noutro momento mais conveniente?"\n\nOBJEÇÃO: "NÃO PRECISAMOS"\n"Compreendo. Muitos dos nossos clientes pensavam o mesmo, até verem quantos clientes estavam a perder por causa da velocidade do site. Posso enviar um exemplo rápido?"',
       true, 4),
      (p_workspace_id, 'social_dm', 'DM Instagram / Facebook', null,
       E'Olá! Vi o vosso perfil e adoro o que fazem 🙌 Reparei que o site não aparece bem no telemóvel — posso ajudar com isso? Tenho ajudado outros negócios de {{setor}} em Portugal a atrair mais clientes online. Posso enviar exemplos?',
       true, 5),
      (p_workspace_id, 'linkedin', 'Mensagem LinkedIn', null,
       E'Olá {{contacto}}, vi o vosso trabalho na {{empresa}} e fiquei impressionado. Tenho ajudado empresas do setor {{setor}} a melhorar a sua presença digital e gerar mais leads. Teria 10 minutos para uma conversa rápida?',
       true, 6),
      (p_workspace_id, 'short_message', 'Mensagem curta (LinkedIn / WhatsApp)',
       'Proposta de criação de website (freelancer na Amadora)',
       E'Olá {{contacto}},\n\nO meu nome é {{meu_nome}}, sou web designer e trabalho no desenvolvimento de websites modernos para empresas.\n\nEstive a analisar a presença digital da {{empresa}} e acredito que seria possível criar um website mais moderno e otimizado para apresentar melhor os serviços da empresa e facilitar o contacto com clientes.\n\nCaso faça sentido, posso enviar uma proposta rápida com algumas ideias para o site.\n\nCumprimentos,\n{{meu_nome}}',
       true, 7),
      (p_workspace_id, 'general_email', 'Email geral — proposta de website',
       'Proposta de criação de website (freelancer na Amadora)',
       E'Olá {{contacto}},\n\nSou o {{meu_nome}}, designer gráfico e web designer freelancer na Amadora. Trabalho na criação de websites modernos, rápidos e pensados para ajudar empresas a ter melhor presença online.\n\nEstive a ver a presença digital da {{empresa}} e gostava de propor a criação de um website mais moderno, claro e otimizado para Google, que ajude a apresentar melhor os serviços da empresa e facilite o contacto com clientes.\n\nO site poderia incluir:\n• Página inicial\n• Página de serviços\n• Página sobre a empresa\n• Página de contactos com formulário e localização\n• Integração com email e redes sociais\n• Design adaptado a telemóvel, tablet e computador\n• Otimização básica para Google\n• Painel simples para gerir conteúdos\n\nTecnologia: WordPress (fácil de atualizar).\n\nPrazo estimado: 15 a 20 dias úteis após aprovação e envio dos conteúdos.\n\nSe fizer sentido, podemos marcar uma breve reunião online ou presencial para falar melhor sobre o projeto.\n\nPortfólio: {{portfolio}}\n\nObrigado e até breve.\n\n{{assinatura}}\n\n{{opt_out}}',
       true, 8),
      (p_workspace_id, 'proposal_structure', 'Estrutura de proposta', null,
       E'1. ABERTURA\nAgradecer a reunião / conversa. Resumir o problema identificado no site atual da {{empresa}}: {{problema}}\n\n2. SOLUÇÃO\nDescrever o que vais entregar: site novo, SEO, velocidade, design mobile-first.\n\n3. RESULTADOS\nMostrar 2-3 exemplos de clientes anteriores com resultados concretos ({{portfolio}}).\n\n4. PACOTES\nApresentar 2-3 opções de preço (nunca uma só — anchoring!).\n\n5. PRÓXIMOS PASSOS\n"Se avançarmos hoje, posso começar na próxima semana." — criar urgência suave.',
       true, 9);
  end if;

  -- ---------------------------------------------------------------------------
  -- Ferramentas (separador "🛠️ Ferramentas")
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from public.tools where workspace_id = p_workspace_id) then
    insert into public.tools (workspace_id, name, category, purpose, url, free_plan, sort_order)
    values
      (p_workspace_id, 'Google Maps', '🔍 Encontrar Leads', 'Pesquisar negócios por setor e cidade', 'https://maps.google.com', 'Sim', 1),
      (p_workspace_id, 'RACIUS.com', '🔍 Encontrar Leads', 'Base de dados de empresas portuguesas', 'https://racius.com', 'Limitado', 2),
      (p_workspace_id, 'LinkedIn', '🔍 Encontrar Leads', 'Perfis de decisores (gerentes, donos)', 'https://linkedin.com', 'Limitado', 3),
      (p_workspace_id, 'Hunter.io', '📧 Encontrar Emails', 'Encontrar emails por domínio de empresa', 'https://hunter.io', '25/mês', 4),
      (p_workspace_id, 'Apollo.io', '📧 Encontrar Emails', 'Base de dados B2B com contactos', 'https://apollo.io', 'Limitado', 5),
      (p_workspace_id, 'NeverBounce', '📧 Encontrar Emails', 'Verificar se o email existe antes de enviar', 'https://neverbounce.com', 'Limitado', 6),
      (p_workspace_id, 'PageSpeed Insights', '🔎 Avaliar Sites', 'Testar velocidade e performance do site', 'https://pagespeed.web.dev', 'Sim', 7),
      (p_workspace_id, 'GTmetrix', '🔎 Avaliar Sites', 'Análise detalhada de velocidade', 'https://gtmetrix.com', 'Sim', 8),
      (p_workspace_id, 'Wappalyzer', '🔎 Avaliar Sites', 'Ver tecnologias usadas no site (extensão Chrome)', 'https://wappalyzer.com', 'Sim', 9),
      (p_workspace_id, 'Mobile-Friendly Test', '🔎 Avaliar Sites', 'Testar compatibilidade mobile', 'https://search.google.com/test/mobile-friendly', 'Sim', 10),
      (p_workspace_id, 'BuiltWith', '🔎 Avaliar Sites', 'Identificar CMS, plugins e tecnologias antigas', 'https://builtwith.com', 'Limitado', 11),
      (p_workspace_id, 'Google Sheets', '📋 Gerir Leads', 'Registar e organizar todos os leads', 'https://sheets.google.com', 'Sim', 12),
      (p_workspace_id, 'HubSpot CRM', '📋 Gerir Leads', 'Pipeline de vendas visual e gratuito', 'https://hubspot.com', 'Sim', 13),
      (p_workspace_id, 'Notion', '📋 Gerir Leads', 'Organizar pipeline Kanban', 'https://notion.so', 'Sim', 14),
      (p_workspace_id, 'Lemlist', '📤 Enviar Emails', 'Automação de cold email com personalização', 'https://lemlist.com', 'Pago', 15),
      (p_workspace_id, 'Mailtrack', '📤 Enviar Emails', 'Ver quando o destinatário abre o email', 'https://mailtrack.io', 'Sim', 16),
      (p_workspace_id, 'Calendly', '📅 Reuniões', 'Agendar reuniões sem ir e vir de emails', 'https://calendly.com', 'Sim', 17),
      (p_workspace_id, 'Loom', '📅 Reuniões', 'Gravar vídeos de diagnóstico personalizados', 'https://loom.com', 'Sim', 18);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Novo utilizador → workspace próprio + assinatura + dados iniciais.
-- (No futuro, um convite com raw_user_meta_data.workspace_id junta o
-- utilizador a um workspace existente.)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1));
begin
  insert into public.workspaces (name)
  values (coalesce(nullif(btrim(v_meta ->> 'workspace_name'), ''), 'VNDesign'))
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  insert into public.signatures (workspace_id, user_id, full_name, role_title, company, phone, email, website, portfolio_url, project_links)
  values (
    v_workspace_id, new.id, v_name,
    coalesce(nullif(btrim(v_meta ->> 'role_title'), ''), 'Designer Gráfico & Web Designer'),
    'VNDesign',
    nullif(btrim(v_meta ->> 'phone'), ''),
    new.email,
    'https://vndesign.pt',
    'https://vndesign.pt/',
    array['https://estrelamadora.pt/', 'https://capecapital.pt/', 'https://capeliving.pt/', 'https://ecvalemourao.com/']
  );

  perform public.seed_workspace_defaults(v_workspace_id);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.seed_workspace_defaults(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
