/**
 * As funcionalidades que se ligam/desligam (Definições → Funcionalidades), por grupos.
 * Também alimentam a pesquisa das Definições.
 */
import type { Features } from '@vndesign/core';
import {
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  Calculator,
  Camera,
  Palette,
  Quote,
  ClipboardList,
  Clock,
  Eye,
  FileSignature,
  Receipt,
  Repeat,
  FileSpreadsheet,
  Rocket,
  Target,
  Users,
  Zap,
  FileText,
  FolderOpen,
  Link2,
  MessageCircle,
  RefreshCcw,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const FEATURES: { key: keyof Features; label: string; description: string; icon: LucideIcon; sub?: boolean }[] = [
  {
    key: 'diagnosis_report',
    label: 'Relatório de diagnóstico em PDF',
    description: 'Na ficha (Diagnóstico do site): o PDF com a tua marca, para ver ou enviar ao cliente em anexo.',
    icon: FileText,
  },
  {
    key: 'site_screenshots',
    label: 'Imagens do site',
    description: 'Ao analisar o site, guarda como aparece no telemóvel e no computador (no relatório PDF e em anexo no email).',
    icon: Camera,
  },
  {
    key: 'email_tracking',
    label: 'Saber quando o lead abre o email',
    description: 'Avisa quando o lead abre um email enviado pela plataforma ou carrega num link (e mostra-o em Hoje).',
    icon: Eye,
  },
  {
    key: 'prospecting_session',
    label: 'Sessão de prospeção',
    description: 'Menu Prospeção: a lista de chamadas do dia, com o resultado do contacto registado com um toque.',
    icon: Target,
  },
  {
    key: 'payments',
    label: 'Pagamentos e faturação',
    description: 'Plano de pagamentos de cada cliente (sinal, prestações) e a faturação no Dashboard.',
    icon: Wallet,
  },
  {
    key: 'projects',
    label: 'Projetos',
    description: 'Clientes com o projeto em curso: prazo de entrega, fases, tarefas, pagamentos, calendário e resumo diário.',
    icon: BriefcaseBusiness,
  },
  {
    key: 'project_kickoff',
    label: 'Arranque automático do projeto',
    description: 'Ao passar a Cliente: prazo, revisões, tarefas e plano de pagamentos (detalhes abaixo).',
    icon: Zap,
    sub: true,
  },
  {
    key: 'briefing',
    label: 'Briefing online',
    description: 'Um formulário para o cliente (objetivos, cores, conteúdos, ficheiros). Perguntas abaixo.',
    icon: ClipboardList,
    sub: true,
  },
  {
    key: 'revisions',
    label: 'Rondas de revisão',
    description: 'Quantas revisões estão incluídas e as que o cliente pediu; avisa quando passa das incluídas.',
    icon: RefreshCcw,
    sub: true,
  },
  {
    key: 'time_tracking',
    label: 'Registo de horas',
    description: 'Temporizador ▶/⏸ em cada projeto e quanto ganhas por hora.',
    icon: Clock,
    sub: true,
  },
  {
    key: 'time_value',
    label: 'Tempo em dinheiro',
    description: 'Mostra quanto vale o tempo registado (horas, cronómetro e Pomodoro) ao teu valor por hora.',
    icon: Wallet,
    sub: true,
  },
  {
    key: 'pomodoro',
    label: 'Pomodoro',
    description: 'Blocos de trabalho com pausas em cada projeto; o trabalho fica no registo de horas (tempos abaixo).',
    icon: Timer,
    sub: true,
  },
  {
    key: 'expenses',
    label: 'Despesas e lucro',
    description: 'Custos de cada projeto, lucro real e ganho líquido por hora.',
    icon: Receipt,
    sub: true,
  },
  {
    key: 'deliverables',
    label: 'Ficheiros e entregas',
    description: 'Links do Drive, Figma ou Canva, com “Enviada” e “Aprovada pelo cliente”.',
    icon: FolderOpen,
    sub: true,
  },
  {
    key: 'launch_checklist',
    label: 'Checklist de lançamento',
    description: 'Antes de publicar o site do cliente: HTTPS, telemóvel, SEO, 404, sitemap, estatísticas… (verifica sozinho).',
    icon: Rocket,
    sub: true,
  },
  {
    key: 'testimonials',
    label: 'Testemunhos dos clientes',
    description: 'No fim do projeto, um link para o cliente dar a opinião (1 a 5 estrelas). Os autorizados aparecem nas propostas.',
    icon: Quote,
    sub: true,
  },
  {
    key: 'collaborators',
    label: 'Colaboradores',
    description: 'Convidar um freelancer para um projeto: só vê as tarefas, os ficheiros, o briefing e as horas dele.',
    icon: Users,
    sub: true,
  },
  {
    key: 'client_page',
    label: 'Página para o cliente',
    description: 'Um link só de leitura para o cliente acompanhar o projeto (sem login).',
    icon: Link2,
    sub: true,
  },
  {
    key: 'client_approvals',
    label: 'Aprovação pelo cliente',
    description: 'Na página do cliente: “Aprovar” ou “Pedir alterações” em cada entrega enviada (cria uma revisão).',
    icon: BadgeCheck,
    sub: true,
  },
  {
    key: 'brand_kit',
    label: 'Kit da marca do cliente',
    description: 'Logótipos, cores, tipos de letra, links e acessos (palavras-passe cifradas), iguais em todos os projetos do cliente.',
    icon: Palette,
  },
  {
    key: 'quote_calculator',
    label: 'Calculadora de orçamento',
    description: 'Serviços e extras → preço sugerido, horas estimadas e €/hora (detalhes abaixo).',
    icon: Calculator,
  },
  {
    key: 'contracts',
    label: 'Contratos',
    description: 'Contrato em PDF gerado a partir da proposta, aceite online pelo cliente.',
    icon: FileSignature,
  },
  {
    key: 'whatsapp_templates',
    label: 'Mensagens prontas no WhatsApp',
    description: 'O botão WhatsApp da ficha abre um menu com mensagens já escritas (primeiro contacto, follow-up). Editam-se em Scripts.',
    icon: MessageCircle,
  },
];

FEATURES.push(
  {
    key: 'renewals',
    label: 'Renovações e avenças',
    description: 'Domínio, alojamento e manutenção de cada cliente: aviso uns dias antes (tarefa e email pronto) e a receita recorrente nas Estatísticas.',
    icon: Repeat,
  },
  {
    key: 'accounting_report',
    label: 'Relatório para a contabilidade',
    description: 'Nas Estatísticas: o que recebeste, gastaste e tens por receber em cada mês, em PDF ou Excel.',
    icon: FileSpreadsheet,
  },
  {
    key: 'site_monitoring',
    label: 'Vigiar os sites dos clientes',
    description: 'Verifica de hora a hora se o site está no ar e quando expiram o certificado SSL e o domínio. Avisa antes e cria uma tarefa.',
    icon: Activity,
  },
  {
    key: 'prospect_watch',
    label: 'Oportunidades nos sites dos leads',
    description: 'Vê os sites dos 20 leads mais quentes de 6 em 6 horas. Se um estiver em baixo, "Não seguro" ou muito lento, avisa e deixa a mensagem pronta para contactar.',
    icon: Target,
  },
  {
    key: 'monthly_goals',
    label: 'Metas do mês',
    description: 'Recebido, propostas, clientes novos, emails, chamadas e WhatsApp: a barra de cada meta no Dashboard e na Prospeção.',
    icon: Target,
  },
);

export const FEATURE_BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));

/** Funcionalidades que dependem de outra (ficam por baixo dela, mais à direita). */
export const FEATURE_PARENT: Partial<Record<keyof Features, keyof Features>> = {
  time_value: 'time_tracking',
  pomodoro: 'time_tracking',
  client_approvals: 'client_page',
};

/** Por grupos: o que serve para quê. "Projetos" liga/desliga tudo o que está dentro. */
export const FEATURE_GROUPS: { title: string; description: string; master?: keyof Features; parts: { title?: string; keys: (keyof Features)[] }[] }[] = [
  {
    title: 'Leads e prospeção',
    description: 'Encontrar, analisar e contactar leads.',
    parts: [{ keys: ['prospecting_session', 'monthly_goals', 'prospect_watch', 'email_tracking', 'whatsapp_templates', 'diagnosis_report', 'site_screenshots'] }],
  },
  {
    title: 'Vendas e faturação',
    description: 'Do orçamento ao dinheiro recebido.',
    parts: [{ keys: ['quote_calculator', 'contracts', 'payments', 'renewals', 'accounting_report'] }],
  },
  {
    title: 'Projetos',
    description: 'Depois do sim do cliente. Com “Projetos” desligado, nada disto aparece.',
    master: 'projects',
    parts: [
      { keys: ['projects'] },
      { title: 'Arranque', keys: ['project_kickoff', 'briefing'] },
      { title: 'Tempo', keys: ['time_tracking', 'time_value', 'pomodoro'] },
      { title: 'Trabalho e entregas', keys: ['revisions', 'deliverables', 'launch_checklist', 'expenses'] },
      { title: 'Cliente e equipa', keys: ['site_monitoring', 'client_page', 'client_approvals', 'testimonials', 'collaborators', 'brand_kit'] },
    ],
  },
];
