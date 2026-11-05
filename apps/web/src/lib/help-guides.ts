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
    ],
    tips: ['Os cartões podem ser organizados (mostrar, esconder e ordenar) no menu do Dashboard.', 'Os gráficos e análises completas estão em Estatísticas.'],
  },
  {
    id: 'tarefas',
    title: 'Tarefas',
    href: '/tarefas',
    summary: 'Todas as tuas tarefas, de todos os leads e projetos, numa lista.',
    steps: [
      'Cria uma tarefa na ficha do lead (cartão Tarefas) ou aqui; escolhe o prazo e, se quiseres, um lembrete à hora.',
      'As tarefas aparecem agrupadas pelo prazo (atrasadas, hoje, próximos dias, sem prazo); filtra por Leads ou Projetos e por responsável.',
      'Marca como feita com o visto; para mudar a data, carrega no prazo da tarefa.',
      'No telemóvel, desliza uma tarefa para a direita para a marcar como feita e para a esquerda para a adiar.',
    ],
    tips: [
      'Escreve como falas: “Ligar à Clínica Sorriso sexta às 10h” fica com o prazo, o lembrete e a sugestão do lead.',
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
      'Ao passar a "Sem interesse", a plataforma pergunta o motivo (fica nas estatísticas).',
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
      'Define o objetivo do dia (opcional): a barra mostra quanto falta.',
      'Para cada lead: liga ou envia o email, regista o resultado e passa ao seguinte.',
      'O resultado registado agenda o próximo passo (follow-up, reunião) e atualiza o estado do lead.',
    ],
    tips: ['"Procurar contacto" tenta encontrar o email e o telefone no site do lead.'],
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
      'Usa "Ponto de situação" para enviar ao cliente um resumo do andamento.',
      'No fim, a checklist de lançamento ajuda a não esquecer nada antes de pôr o site no ar.',
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
      'Assinatura → Cartão de contacto: um link e um QR para mostrar em reuniões e feiras; quem deixa o contacto fica lead.',
    ],
  },
];
