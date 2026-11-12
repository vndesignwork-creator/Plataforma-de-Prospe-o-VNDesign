/**
 * Guias da página Ajuda (/ajuda, aberta a partir das Definições): um por secção
 * da plataforma; /ajuda#<id> abre logo esse guia.
 */
export interface HelpGuide {
  id: string;
  title: string;
  /** A página da plataforma (para "Abrir"); o prospetor só vê os guias das páginas que pode abrir. */
  href: string;
  summary: string;
  steps: string[];
  tips?: string[];
}

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros passos',
    href: '/definicoes',
    summary: 'O que preparar uma vez para a plataforma trabalhar por ti.',
    steps: [
      'Em Definições → Conta, põe o teu nome e a foto (aparecem nos avisos e na equipa).',
      'Em Definições → Email de envio, liga a tua conta de email: os emails saem dela e as respostas aparecem sozinhas na plataforma.',
      'Em Definições → Assinatura, escreve a assinatura e, se quiseres, acrescenta o logótipo.',
      'Em Definições → Serviços, revê os serviços e os preços: são usados nas propostas e nos scripts.',
      'Importa os leads que já tens (Leads → Importar) ou cria o primeiro em Leads → Novo lead.',
    ],
    tips: ['Ctrl K (⌘K no Mac) abre a pesquisa rápida em qualquer página: leads, tarefas e páginas.', 'Carrega em ? (fora de uma caixa de texto) para ver todos os atalhos do teclado.'],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    href: '/dashboard',
    summary: 'O dia de hoje num ecrã: o que fazer, quem respondeu e como está o pipeline.',
    steps: [
      '"Hoje" junta os follow-ups, as tarefas e as reuniões do dia. Marca como feito ou adia diretamente na lista (no telemóvel, desliza a linha: direita = feito, esquerda = adiar).',
      '"Respostas" mostra os leads que responderam e ainda não foram tratados.',
      '"Leads quentes" são os que abriram emails ou clicaram em links nos últimos dias: bom momento para ligar.',
      'Os números de cima comparam o período escolhido com o anterior; carrega num número para ver os leads.',
      '"Metas do mês": recebido, propostas, clientes novos, emails, chamadas e WhatsApp. A barra mostra quanto já fizeste e o traço onde devias ir hoje (pelos dias úteis); por baixo, quanto falta por dia útil.',
      '"Sites vigiados" (clientes e leads quentes) só aparece quando há um site em baixo ou um certificado ou domínio a expirar.',
    ],
    tips: ['Os cartões podem ser organizados (mostrar, esconder e ordenar) no menu do Dashboard.', 'Os gráficos e análises completas estão em Estatísticas.'],
  },
  {
    id: 'tarefas',
    title: 'Tarefas',
    href: '/tarefas',
    summary: 'Todas as tuas tarefas em cartões (como no Google Keep) ou numa lista pelo prazo.',
    steps: [
      'Cartões: cada lista tem um título e as suas tarefas (em “Criar uma lista…”, uma por linha); cada lead ou projeto com tarefas tem o seu cartão.',
      'Em cada cartão, escreve em “Nova tarefa…” e carrega em Enter; arrasta pela pega para mudar a ordem; em cada tarefa há copiar, duplicar, mover para outro cartão e apagar.',
      'Cria uma tarefa na ficha do lead (cartão Tarefas) ou aqui; escolhe o prazo e, se quiseres, um lembrete à hora.',
      'As tarefas aparecem agrupadas pelo prazo (atrasadas, hoje, próximos dias, sem prazo); filtra por Leads ou Projetos e por responsável.',
      'Marca como feita com o visto; para mudar a data, carrega no prazo da tarefa.',
      'No telemóvel, desliza uma tarefa para a direita para a marcar como feita e para a esquerda para a adiar.',
      'No ⋯ de cada cartão: afixar no topo, cor, Mover ▸ e arquivar. A seta ao lado do título recolhe o cartão (ou “Recolher todos”); o número vermelho são as tarefas em atraso e “Só com atrasadas” mostra só esses cartões. A ordem, as cores, os afixados, os recolhidos e os cartões de leads arquivados são só teus; os arquivados ficam em “Arquivados”, no fim (um cartão de lead volta sozinho ao quadro se aparecer uma tarefa nova), e a pesquisa também os encontra.',
      'Tarefas que se repetem: na janela de editar, escolhe “Repetir” (todos os dias, dias úteis, semanas, meses ou anos). Ao concluir, a próxima é criada sozinha com a data seguinte.',
      'Com equipa: “Partilhar com a equipa” no ⋯ da lista deixa todos verem e mexerem; em cada tarefa feita vê-se quem a marcou.',
    ],
    tips: [
      'Escreve como falas: “Ligar à Clínica Sorriso sexta às 10h” fica com o prazo, o lembrete e a sugestão do lead; “… todas as segundas” ou “… todo o dia 1” fica a repetir-se.',
      'Listas de tarefas prontas (ex.: arranque de projeto) ficam em Definições → Listas de tarefas.',
    ],
  },
  {
    id: 'leads',
    title: 'Leads',
    href: '/leads',
    summary: 'A lista de todos os contactos, com filtros, pesquisa e ações em lote.',
    steps: [
      'Pesquisa pelo nome, email, telefone ou cidade; usa os filtros de cima (estado, setor, etiquetas…) e "Mais filtros".',
      'Abre um lead para ver a ficha: contactos, próxima ação, tarefas, linha do tempo, propostas e diagnóstico do site.',
      'Seleciona vários leads para mudar o estado, o responsável ou as etiquetas de uma vez.',
      'O filtro "Tempo na fase" (em Mais filtros) mostra os leads parados há mais de 7, 14 ou 30 dias.',
    ],
    tips: ['A próxima ação de cada lead (ex.: follow-up) vai para a agenda e para o "Hoje" do Dashboard.', 'Leads repetidos: Leads → Duplicados junta-os sem perder dados.'],
  },
  {
    id: 'importar',
    title: 'Importar leads',
    href: '/importar',
    summary: 'Trazer leads de uma folha de cálculo (Excel ou CSV).',
    steps: [
      'Em Leads → Importar, escolhe o ficheiro. A primeira linha deve ter os nomes das colunas.',
      'Confirma a correspondência das colunas (empresa, email, telefone, website…).',
      'Revê a pré-visualização: os duplicados e os emails com domínio sem caixa de correio ficam assinalados.',
      'Carrega em Importar. Os leads repetidos não são criados outra vez.',
    ],
  },
  {
    id: 'kanban',
    title: 'Kanban',
    href: '/kanban',
    summary: 'Os leads em colunas por estado: Identificado → Contactado → Respondeu → Reunião → Proposta → Cliente.',
    steps: [
      'Arrasta um cartão para outra coluna para mudar o estado (no telemóvel, mantém o dedo no cartão e arrasta).',
      'Ao passar a "Contactado", o follow-up fica marcado automaticamente para daqui a 3 dias.',
      'Ao passar a "Sem interesse", a plataforma pergunta o motivo (fica nas estatísticas) e, se o lead tiver tarefas por fazer, se as conclui, apaga ou deixa como estão.',
      'Usa o olho para mostrar ou esconder colunas e os filtros de cima para ver só o que interessa.',
    ],
  },
  {
    id: 'prospecao',
    title: 'Prospeção',
    href: '/prospecao',
    summary: 'Uma sessão para contactar leads um a um, sem saltar de página em página.',
    steps: [
      'Escolhe o modo: por email ou por telefone.',
      'No topo ficam as metas do mês do modo (emails; ou chamadas e WhatsApp a telefonar). Contam os emails enviados e os leads a quem ligaste ou mandaste WhatsApp (um por lead e por dia).',
      'Para cada lead: liga ou envia o email, regista o resultado e passa ao seguinte.',
      'O resultado registado agenda o próximo passo (follow-up, reunião) e atualiza o estado do lead.',
    ],
    tips: [
      '"Procurar contacto" tenta encontrar o email e o telefone no site do lead.',
      'O lead disse "É caro" ou "Já tenho site"? Carrega em "Objeção", escolhe o que ele disse e aparece a resposta pronta para o telefone, WhatsApp ou email (escrita pela IA para esse lead, se a IA estiver ligada). Também está na ficha.',
      '"Oportunidade" num lead quer dizer que o site dele está em baixo, aparece como "Não seguro" ou demora muito a abrir: é uma boa razão para ligar, e a mensagem já vem escrita. A plataforma vigia sozinha os sites dos 20 leads mais quentes.',
    ],
  },
  {
    id: 'gerar-leads',
    title: 'Gerar leads',
    href: '/gerar-leads',
    summary: 'A IA procura empresas na internet por setor e zona e sugere leads novos.',
    steps: [
      'Escolhe o setor, a zona e quantos leads queres.',
      'Revê as sugestões: os que já existem na plataforma ficam assinalados.',
      'Acrescenta os que interessam (um a um ou todos).',
      'Para repetir todas as semanas, cria um agendamento: os leads novos chegam com um aviso.',
    ],
    tips: ['A IA usada (e a chave) configura-se em Definições → IA.'],
  },
  {
    id: 'projetos',
    title: 'Projetos',
    href: '/projetos',
    summary: 'Os clientes com trabalho em curso: fases, prazos, pagamentos, horas e entregas.',
    steps: [
      'Quando um lead passa a Cliente, o projeto arranca: prazo, revisões incluídas, tarefas e plano de pagamentos.',
      'Na ficha do cliente, acompanha a fase (Briefing → Em produção → Revisões → Entrega) e regista pagamentos, horas e despesas.',
      'Pede o briefing online, envia o contrato para aceitar e partilha entregas com o cliente.',
      'Em "O que falta o cliente enviar", pede os textos, as fotos ou os acessos: o cliente envia-os pela página do projeto e recebes um aviso.',
      'Usa "Ponto de situação" para enviar ao cliente um resumo do andamento.',
      'No fim, a checklist de lançamento ajuda a não esquecer nada antes de pôr o site no ar.',
      'Ao concluir (ou em Cliente e equipa → Testemunho), pede o testemunho: o cliente dá de 1 a 5 estrelas e escreve a opinião. Com autorização e 4 ou 5 estrelas, aparece no PDF das propostas (Definições → Testemunhos) e a página sugere-lhe também o Google.',
      'Em Tempo e dinheiro → Renovações e avenças, regista o domínio, o alojamento e a manutenção mensal: uns dias antes recebes um aviso e uma tarefa, e o email ao cliente já vem escrito. “Renovado” passa à data seguinte e regista o pagamento.',
      'Em Cliente e equipa → Site do cliente, “Vigiar o site”: de hora a hora vê se está no ar; avisa (com tarefa) se for abaixo, 14 dias antes de o certificado SSL expirar e 30 dias antes do domínio. Se a data do domínio não vier sozinha, escreve-a no ⋯.',
    ],
    tips: ['O temporizador e o Pomodoro contam as horas do projeto; o valor por hora aparece nas Estatísticas.'],
  },
  {
    id: 'equipa',
    title: 'Equipa',
    href: '/equipa',
    summary: 'Prospetores que contactam leads por ti e colaboradores dos projetos.',
    steps: [
      'Convida por email e escolhe o papel: administrador, membro ou prospetor.',
      'O prospetor só vê a parte comercial (sem valores, propostas nem pagamentos).',
      'Em Prospeção, vê os números de cada pessoa; em Atividade, o que foi feito e por quem.',
      'Colaboradores dos projetos (designers, programadores) recebem acesso só ao projeto onde trabalham.',
    ],
  },
  {
    id: 'estatisticas',
    title: 'Estatísticas',
    href: '/estatisticas',
    summary: 'Como está a correr: funil, taxas de resposta, melhores dias e horas, rentabilidade.',
    steps: [
      'Escolhe o período em cima; os números comparam com o período anterior.',
      'O funil mostra quantos leads passaram por cada fase (contam uma vez, mesmo que voltem atrás).',
      'Em Emails, vê as aberturas e respostas por modelo e o melhor dia e hora para enviar.',
      'Em Rentabilidade, o valor ganho por hora em cada projeto.',
      'Em Receita recorrente, quanto entra todos os meses com as renovações e avenças, e as próximas datas.',
      'Em Contabilidade, escolhe o mês e descarrega o relatório em PDF ou Excel (recebido, despesas e por receber) para o contabilista.',
    ],
  },
  {
    id: 'scripts',
    title: 'Scripts',
    href: '/scripts',
    summary: 'Modelos de email, WhatsApp e chamada, com variáveis que se preenchem sozinhas.',
    steps: [
      'Cria um modelo e escreve a mensagem; usa o botão Variável (ou escreve {{) para pôr o nome da empresa, a cidade, os serviços…',
      'Escolhe a categoria e o canal (email, WhatsApp, chamada).',
      'Na ficha do lead ou na Prospeção, escolhe o modelo: a mensagem aparece pronta a rever.',
      'Para comparar duas versões, liga "Testar uma versão B": os leads recebem A ou B alternadamente e as Estatísticas mostram qual resulta melhor.',
    ],
  },
  {
    id: 'email',
    title: 'Emails e respostas',
    href: '/definicoes/email',
    summary: 'Enviar pela tua conta, saber quem abriu e receber as respostas na plataforma.',
    steps: [
      'Liga a conta em Definições → Email de envio (servidor de envio e de receção).',
      'Ao enviar, o email fica na linha do tempo do lead; as aberturas e cliques aparecem nos avisos.',
      'As respostas chegam sozinhas: o lead passa a "Respondeu" e aparece em "Respostas" no Dashboard.',
      'Emails devolvidos ficam assinalados no lead, para procurar outro contacto.',
      '"Verificar o domínio" (em Definições → Email de envio) confirma o SPF, DKIM e DMARC do teu domínio: se faltar algum, os emails podem ir para o spam. Mostra o registo a acrescentar no DNS.',
    ],
  },
  {
    id: 'avisos',
    title: 'Avisos',
    href: '/dashboard',
    summary: 'O sino em cima: lembretes, respostas, emails abertos, tarefas novas e menções.',
    steps: [
      'Carrega no sino para ver os avisos agrupados por dia; cada um leva ao lead ou à tarefa.',
      'Algumas ações fazem-se logo no aviso (responder, ligar, abrir a tarefa).',
      'Em Definições → Conta, liga as notificações no telemóvel e escolhe o horário de silêncio.',
      'À segunda-feira chega um aviso com os leads a arrefecer (em conversa e sem resposta há vários dias).',
    ],
  },
  {
    id: 'definicoes',
    title: 'Definições',
    href: '/definicoes',
    summary: 'Tudo o que se configura uma vez: conta, email, serviços, propostas, funcionalidades.',
    steps: [
      'Funcionalidades: liga ou desliga as partes da plataforma que não usas (saem do menu).',
      'Propostas: textos, condições e aspeto do PDF.',
      'Campos e Etiquetas: informação extra e etiquetas para organizar os leads.',
      'Não contactar: emails e domínios que nunca devem receber mensagens.',
      'Regras automáticas: “se o lead não tem site, pôr a etiqueta Sem site”, “se não responde há 21 dias, passar a Em pausa”… Cada regra aplica-se uma vez a cada lead.',
      'Assinatura → Cartão de contacto: um link e um QR para mostrar em reuniões e feiras; quem deixa o contacto fica lead.',
      'Formulário do site → Analisar o meu site grátis: uma página para pores no teu site. O visitante escreve o site e o email, fica lead quente (com "Ligar" para hoje) e recebe o diagnóstico em PDF pelo teu email de envio. Para um site em WordPress, "Descarregar o plugin": dá o elemento "Análise grátis do site" no Bricks (textos e cores à tua escolha) e o shortcode [vndesign_analise_gratis].',
      'Na análise grátis: depois de enviar, o visitante vê logo um primeiro resultado (velocidade, telemóvel, segurança) e pode abrir um relatório de exemplo. Cada pedido guarda de onde veio (página e campanha), quem não responde recebe um follow-up automático (3 dias, de origem) e o cartão mostra os números do mês. Se chegarem pedidos falsos, liga o Cloudflare Turnstile no mesmo cartão.',
    ],
  },
];
