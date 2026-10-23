/**
 * Schemas Zod da API /api/v1 — validam pedidos no servidor, os formulários
 * na web (React Hook Form) e geram a documentação OpenAPI.
 * Convenção da API: snake_case, datas "AAAA-MM-DD", timestamps ISO 8601,
 * valores em euros com 2 casas decimais.
 */
import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  LEAD_CHANNELS,
  LEAD_STATUSES,
  MANUAL_ACTIVITY_TYPES,
  MOBILE_STATUSES,
  SECTOR_ICON_KEYS,
  TEMPLATE_KINDS,
  type SectorIcon,
} from './enums';
import { ensureUrlProtocol } from './normalize';
import { AiSettingsSchema, AiSettingsUpdateSchema, SERVER_AI_PROVIDER } from './ai-providers';
import { ServiceCategoryKeySchema, ServiceKeyListSchema, ServiceKeySchema } from './services';
import { TodayOpenedEmailSchema } from './mail';
import { DEFAULT_POMODORO_SETTINGS, PomodoroSettingsSchema } from './pomodoro';
import { DEFAULT_TEAM_SETTINGS, MEMBER_ROLES, TeamSettingsSchema } from './team';
import { DEFAULT_QUOTE_SETTINGS, QuoteSettingsSchema } from './quote';
import { TodayMeetingSchema } from './projects';
import { TodayTasksSchema } from './tasks';

// Mensagens genéricas de validação em português (as específicas estão em cada campo).
z.config(z.locales.pt());

// -----------------------------------------------------------------------------
// Blocos reutilizáveis (strings vazias passam a null)
// -----------------------------------------------------------------------------
const emptyToNull = (v: string) => (v === '' ? null : v);

export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres.` })
    .transform(emptyToNull)
    .nullable();

export const nullableDate = z
  .string()
  .trim()
  .transform(emptyToNull)
  .pipe(z.iso.date({ error: 'Data inválida.' }).nullable())
  .nullable()
  .meta({ description: 'Data no formato AAAA-MM-DD', example: '2026-10-08' });

export const nullableEmail = z
  .string()
  .trim()
  .max(254)
  .transform(emptyToNull)
  .pipe(z.email({ error: 'Email inválido.' }).nullable())
  .nullable();

export const nullableUrl = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : ensureUrlProtocol(v)))
  .pipe(z.url({ protocol: /^https?$/, error: 'URL inválido.' }).nullable())
  .nullable()
  .meta({ description: 'URL; sem protocolo assume https://', example: 'https://vndesign.pt' });

const pagespeed = z
  .number({ error: 'PageSpeed tem de ser um número.' })
  .int({ error: 'PageSpeed tem de ser um número inteiro.' })
  .min(0, { error: 'Entre 0 e 100.' })
  .max(100, { error: 'Entre 0 e 100.' })
  .nullable();

const estimatedValue = z
  .number({ error: 'Valor inválido.' })
  .min(0, { error: 'O valor não pode ser negativo.' })
  .max(100_000_000)
  .transform((v) => Math.round(v * 100) / 100)
  .nullable()
  .meta({ description: 'Valor estimado em euros', example: 1200 });

export const LeadStatusSchema = z.enum(LEAD_STATUSES).meta({ id: 'LeadStatus' });
export const LeadChannelSchema = z.enum(LEAD_CHANNELS).meta({ id: 'LeadChannel' });
export const MobileStatusSchema = z
  .enum(MOBILE_STATUSES)
  .meta({ id: 'MobileStatus', description: '"desconhecido" corresponde ao "--" da folha' });

// -----------------------------------------------------------------------------
// Leads
// -----------------------------------------------------------------------------
const leadFields = {
  company_name: z
    .string({ error: 'Indica o nome da empresa.' })
    .trim()
    .min(1, { error: 'Indica o nome da empresa.' })
    .max(300, { error: 'Máximo de 300 caracteres.' }),
  sector_id: z.uuid({ error: 'Setor inválido.' }).nullable(),
  website: nullableUrl,
  city: nullableText(120),
  address: nullableText(300),
  problems: nullableText(4000),
  pagespeed,
  mobile: MobileStatusSchema,
  email: nullableEmail,
  phone: nullableText(60),
  contact_name: nullableText(160),
  status: LeadStatusSchema,
  channel: LeadChannelSchema.nullable(),
  first_contact_on: nullableDate,
  last_follow_up_on: nullableDate,
  next_action_text: nullableText(300),
  next_action_on: nullableDate,
  estimated_value: estimatedValue,
  notes: nullableText(10_000),
  approach_angle: nullableText(4000),
  source_url: nullableUrl,
  suggested_on: nullableDate,
  email_subject: nullableText(300),
  email_body: nullableText(20_000),
  /** Serviços de interesse (chaves de GET /services; a base de dados confirma que existem). */
  services: ServiceKeyListSchema,
  /** Nome do projeto (ex.: "Loja online"), sobretudo quando o cliente tem vários. */
  project_title: nullableText(120),
  /** Responsável pelo lead (membro da equipa; null = sem responsável). */
  assigned_to: z.uuid({ error: 'Responsável inválido.' }).nullable(),
};

export const EDITABLE_LEAD_FIELDS = Object.keys(leadFields) as (keyof typeof leadFields)[];

export const LeadCreateSchema = z
  .object(leadFields)
  .partial()
  .required({ company_name: true })
  .meta({ id: 'LeadCreate' });
export type LeadCreateInput = z.input<typeof LeadCreateSchema>;
export type LeadCreate = z.output<typeof LeadCreateSchema>;

export const LeadUpdateSchema = z
  .object(leadFields)
  .partial()
  .meta({ id: 'LeadUpdate', description: 'Só os campos enviados são alterados.' });
export type LeadUpdate = z.output<typeof LeadUpdateSchema>;

export const SectorRefSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    emoji: z.string().nullable(),
    icon: z.string().nullable().optional().meta({ description: 'Ícone de linha (ver SECTOR_ICONS)' }),
  })
  .meta({ id: 'SectorRef' });

export const LeadSchema = z
  .object({
    id: z.uuid(),
    number: z.int().meta({ description: 'O "#" da folha, sequencial por workspace' }),
    company_name: z.string(),
    sector_id: z.uuid().nullable(),
    sector: SectorRefSchema.nullable(),
    website: z.string().nullable(),
    city: z.string().nullable(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    geocode_status: z.enum(['ok', 'approx', 'manual', 'not_found']).nullable().optional(),
    problems: z.string().nullable(),
    pagespeed: z.int().nullable(),
    mobile: MobileStatusSchema,
    email: z.string().nullable(),
    phone: z.string().nullable(),
    contact_name: z.string().nullable(),
    status: LeadStatusSchema,
    channel: LeadChannelSchema.nullable(),
    first_contact_on: z.string().nullable(),
    last_follow_up_on: z.string().nullable(),
    next_action_text: z.string().nullable(),
    next_action_on: z.string().nullable(),
    estimated_value: z.number().nullable(),
    services: z.array(z.string()).optional(),
    notes: z.string().nullable(),
    approach_angle: z.string().nullable(),
    source_url: z.string().nullable(),
    suggested_on: z.string().nullable(),
    email_subject: z.string().nullable(),
    email_body: z.string().nullable(),
    kanban_position: z.number(),
    status_changed_at: z.string(),
    anonymized_at: z.string().nullable(),
    /** Arquivado: fora da lista, do Kanban, do mapa e de "Hoje" (histórico e estatísticas mantêm-se). */
    archived_at: z.string().nullable().optional(),
    /** Tarefas do lead (total e concluídas); só nas listas, no Kanban e na ficha. */
    task_progress: z.object({ total: z.int(), done: z.int() }).nullable().optional(),
    /** Prioridade (0–100) calculada pela base de dados e as razões, em português. */
    score: z.int().optional().meta({ description: 'Prioridade 0–100 (maior = contactar primeiro)' }),
    score_reasons: z.array(z.string()).optional(),
    /** Follow-ups feitos por email desde o primeiro contacto (sequência). */
    follow_up_count: z.int().optional(),
    /** Projeto do cliente concluído (página Projetos). */
    project_completed_at: z.string().nullable().optional(),
    /** Projeto novo de um cliente que volta: o registo principal do cliente. */
    client_of: z.uuid().nullable().optional(),
    project_title: z.string().nullable().optional(),
    /** Responsável pelo lead (equipa de prospeção). */
    assigned_to: z.uuid().nullable().optional(),
    created_by: z.uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'Lead' });
export type Lead = z.infer<typeof LeadSchema>;

export const LEAD_SORT_FIELDS = [
  'number',
  'score',
  'kanban_position',
  'company_name',
  'city',
  'status',
  'channel',
  'pagespeed',
  'mobile',
  'estimated_value',
  'first_contact_on',
  'last_follow_up_on',
  'next_action_on',
  'suggested_on',
  'created_at',
  'updated_at',
] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

/** Lista separada por vírgulas na query string ("contactado,respondeu"). */
const csvList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(50));

export const LEAD_ARCHIVE_FILTERS = ['only', 'include'] as const;
export type LeadArchiveFilter = (typeof LEAD_ARCHIVE_FILTERS)[number];

export const LeadListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional().meta({ description: 'Pesquisa em nome, cidade, contacto, email, website, problemas e notas' }),
    sector: csvList(z.union([z.uuid(), z.literal('none')])).optional().meta({ description: 'IDs de setor separados por vírgula ("none" = sem setor)' }),
    status: csvList(LeadStatusSchema).optional(),
    channel: csvList(z.union([LeadChannelSchema, z.literal('none')])).optional(),
    service: csvList(z.union([ServiceKeySchema, z.literal('none')]))
      .optional()
      .meta({ description: 'Serviços de interesse separados por vírgula ("none" = sem serviço); basta um coincidir' }),
    city: z.string().trim().max(120).optional(),
    assigned: z
      .union([z.uuid(), z.enum(['me', 'none'])])
      .optional()
      .meta({ description: 'Responsável: id do membro, "me" (os meus) ou "none" (sem responsável)' }),
    suggested_from: z.iso.date().optional(),
    suggested_to: z.iso.date().optional(),
    due: z
      .enum(['overdue', 'today', 'week'])
      .optional()
      .meta({ description: 'Próxima ação em atraso, para hoje ou nos próximos 7 dias' }),
    include_anonymized: z.enum(['true', 'false']).optional(),
    archived: z
      .enum(LEAD_ARCHIVE_FILTERS)
      .optional()
      .meta({ description: 'Leads arquivados: "only" = só os arquivados, "include" = todos. Por omissão ficam de fora.' }),
    sort: z.enum(LEAD_SORT_FIELDS).default('number'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .meta({ id: 'LeadListQuery' });
export type LeadListQuery = z.output<typeof LeadListQuerySchema>;

// -----------------------------------------------------------------------------
// Ações em vários leads de uma vez (lista) — também usadas na ficha com um só id
// -----------------------------------------------------------------------------
export const LEAD_BULK_ACTIONS = ['archive', 'restore', 'delete', 'assign'] as const;
export type LeadBulkAction = (typeof LEAD_BULK_ACTIONS)[number];

export const LeadBulkActionSchema = z
  .object({
    action: z.enum(LEAD_BULK_ACTIONS).meta({ description: 'archive = arquivar, restore = repor do arquivo, delete = apagar, assign = mudar o responsável' }),
    ids: z.array(z.uuid()).min(1, { error: 'Escolhe pelo menos um lead.' }).max(200, { error: 'No máximo 200 leads de cada vez.' }),
    /** Com action "assign": o novo responsável (null = sem responsável). */
    assigned_to: z.uuid().nullable().optional(),
  })
  .meta({ id: 'LeadBulkAction' });
export type LeadBulkActionInput = z.input<typeof LeadBulkActionSchema>;

export const LeadBulkResultSchema = z
  .object({
    action: z.enum(LEAD_BULK_ACTIONS),
    affected: z.int().meta({ description: 'Leads alterados (os já arquivados/repostos ou inexistentes não contam)' }),
  })
  .meta({ id: 'LeadBulkResult' });
export type LeadBulkResult = z.infer<typeof LeadBulkResultSchema>;

// -----------------------------------------------------------------------------
// Duplicados, "não contactar", juntar e anonimizar
// -----------------------------------------------------------------------------
export const DuplicateCheckSchema = z
  .object({
    company_name: z.string().trim().max(300).optional().default(''),
    website: z.string().trim().max(1000).nullish(),
    email: z.string().trim().max(254).nullish(),
    exclude_id: z.uuid().nullish(),
  })
  .meta({ id: 'DuplicateCheck' });

export const DuplicateMatchSchema = z
  .object({
    lead_id: z.uuid(),
    number: z.int(),
    company_name: z.string(),
    city: z.string().nullable(),
    status: LeadStatusSchema,
    website: z.string().nullable(),
    email: z.string().nullable(),
    reasons: z.array(z.enum(['website', 'email', 'name', 'email_domain', 'similar_name'])),
    strength: z.enum(['strong', 'possible']),
    score: z.number(),
  })
  .meta({ id: 'DuplicateMatch' });
export type DuplicateMatch = z.infer<typeof DuplicateMatchSchema>;

export const DoNotContactSchema = z
  .object({
    id: z.uuid(),
    company_name: z.string(),
    website: z.string().nullable(),
    email: z.string().nullable(),
    reason: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: 'DoNotContact' });
export type DoNotContact = z.infer<typeof DoNotContactSchema>;

export const DoNotContactCreateSchema = z
  .object({
    company_name: z.string().trim().min(1, { error: 'Indica o nome da empresa.' }).max(300),
    website: z.string().trim().max(1000).transform(emptyToNull).nullish(),
    email: z.string().trim().max(254).transform(emptyToNull).nullish(),
    reason: nullableText(500).optional(),
  })
  .meta({ id: 'DoNotContactCreate' });

export const DuplicateCheckResultSchema = z
  .object({
    duplicates: z.array(DuplicateMatchSchema),
    do_not_contact: z.array(DoNotContactSchema),
  })
  .meta({ id: 'DuplicateCheckResult' });
export type DuplicateCheckResult = z.infer<typeof DuplicateCheckResultSchema>;

export const LeadMergeSchema = z
  .object({
    duplicate_ids: z
      .array(z.uuid())
      .max(10)
      .default([])
      .meta({ description: 'Leads a juntar ao principal (são apagados). Vazio = só aplicar os valores.' }),
    values: LeadUpdateSchema.default({}).meta({ description: 'Valores escolhidos para o lead principal' }),
  })
  .meta({ id: 'LeadMerge' });

export const LeadAnonymizeSchema = z
  .object({
    add_to_do_not_contact: z.boolean().default(false),
    reason: nullableText(500).optional(),
  })
  .meta({ id: 'LeadAnonymize' });

// -----------------------------------------------------------------------------
// Atividade
// -----------------------------------------------------------------------------
export const ActivitySchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    type: z.enum(ACTIVITY_TYPES),
    body: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    actor_user_id: z.uuid().nullable(),
    actor_token_id: z.uuid().nullable().meta({ description: 'Token de integração usado (se a ação veio da API)' }),
    created_at: z.string(),
  })
  .meta({ id: 'Activity' });
export type Activity = z.infer<typeof ActivitySchema>;

export const ActivityCreateSchema = z
  .object({
    type: z.enum(MANUAL_ACTIVITY_TYPES),
    body: nullableText(10_000).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((a) => a.type !== 'note' || (a.body ?? '').length > 0, {
    error: 'Escreve o texto da nota.',
    path: ['body'],
  })
  .meta({ id: 'ActivityCreate' });

// -----------------------------------------------------------------------------
// Setores
// -----------------------------------------------------------------------------
export const SectorSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    emoji: z.string().nullable(),
    icon: z.string().nullable().optional(),
    sort_order: z.int(),
    priority_rank: z.int().nullable(),
    opportunity_notes: z.string().nullable(),
    sales_arguments: z.string().nullable(),
    archived_at: z.string().nullable(),
    lead_count: z.int().optional(),
  })
  .meta({ id: 'Sector' });
export type Sector = z.infer<typeof SectorSchema>;

export const SectorCreateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Indica o nome do setor.' }).max(80),
    emoji: nullableText(16).optional(),
    icon: z.enum(SECTOR_ICON_KEYS as [SectorIcon, ...SectorIcon[]]).nullable().optional(),
    sort_order: z.int().min(0).max(999).optional(),
    priority_rank: z.int().min(1).max(99).nullable().optional(),
    opportunity_notes: nullableText(4000).optional(),
    sales_arguments: nullableText(4000).optional(),
  })
  .meta({ id: 'SectorCreate' });

export const SectorUpdateSchema = SectorCreateSchema.partial()
  .extend({ archived: z.boolean().optional() })
  .meta({ id: 'SectorUpdate' });

// -----------------------------------------------------------------------------
// Diversos
// -----------------------------------------------------------------------------
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.int(),
    detail: z.string().optional(),
    errors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .catchall(z.unknown())
  .meta({ id: 'Problem', description: 'Erro no formato RFC 9457 (application/problem+json)' });
export type Problem = z.infer<typeof ProblemSchema>;

export const PaginationMetaSchema = z
  .object({ page: z.int(), limit: z.int(), total: z.int() })
  .meta({ id: 'PaginationMeta' });

export const PreferenceValueSchema = z.object({ value: z.json() }).meta({ id: 'PreferenceValue' });

/** Sequência de follow-ups por email: dias depois do email anterior e o modelo de cada passo. */
export const FOLLOW_UP_SEQUENCE_MAX_STEPS = 5;
export const FollowUpStepSchema = z.object({
  days: z.int({ error: 'Indica um número de dias.' }).min(1, { error: 'Mínimo 1 dia.' }).max(60, { error: 'Máximo 60 dias.' }),
  /** null = o modelo de follow-up mais adequado ao lead (categoria dos serviços, setor). */
  template_id: z.uuid().nullable().default(null),
});
export type FollowUpStep = z.infer<typeof FollowUpStepSchema>;
export const DEFAULT_FOLLOW_UP_SEQUENCE = {
  enabled: true,
  steps: [
    { days: 3, template_id: null },
    { days: 7, template_id: null },
    { days: 14, template_id: null },
  ],
};
const FollowUpStepsSchema = z
  .array(FollowUpStepSchema)
  .min(1, { error: 'Pelo menos um follow-up.' })
  .max(FOLLOW_UP_SEQUENCE_MAX_STEPS, { error: `No máximo ${FOLLOW_UP_SEQUENCE_MAX_STEPS} follow-ups.` });
export const FollowUpSequenceSchema = z.object({
  enabled: z.boolean().default(true),
  steps: FollowUpStepsSchema.default(DEFAULT_FOLLOW_UP_SEQUENCE.steps),
});
export type FollowUpSequence = z.infer<typeof FollowUpSequenceSchema>;

/** Funcionalidades que se podem desligar (Definições → Funcionalidades). */
export const FeaturesSchema = z.object({
  diagnosis_report: z.boolean().default(true).meta({ description: 'Relatório de diagnóstico do site em PDF' }),
  payments: z.boolean().default(true).meta({ description: 'Pagamentos dos clientes e faturação' }),
  meetings: z.boolean().default(true).meta({ description: 'Marcar reuniões (convite por email)' }),
  projects: z.boolean().default(true).meta({ description: 'Página Projetos (clientes com projeto em curso)' }),
  whatsapp_templates: z.boolean().default(true).meta({ description: 'Mensagens prontas no botão WhatsApp da ficha' }),
  revisions: z.boolean().default(true).meta({ description: 'Projetos: rondas de revisão' }),
  time_tracking: z.boolean().default(true).meta({ description: 'Projetos: registo de horas' }),
  deliverables: z.boolean().default(true).meta({ description: 'Projetos: ficheiros e entregas' }),
  client_page: z.boolean().default(true).meta({ description: 'Projetos: página de acompanhamento para o cliente' }),
  client_approvals: z.boolean().default(true).meta({ description: 'Página do cliente: aprovar entregas ou pedir alterações' }),
  project_kickoff: z.boolean().default(true).meta({ description: 'Preparar o projeto sozinho quando o lead passa a Cliente' }),
  contracts: z.boolean().default(true).meta({ description: 'Contratos em PDF, aceites online pelo cliente' }),
  briefing: z.boolean().default(true).meta({ description: 'Projetos: briefing online (formulário para o cliente)' }),
  expenses: z.boolean().default(true).meta({ description: 'Projetos: despesas e lucro' }),
  site_screenshots: z.boolean().default(true).meta({ description: 'Imagens do site do lead (telemóvel e computador)' }),
  email_tracking: z.boolean().default(true).meta({ description: 'Saber quando o lead abre o email ou carrega num link' }),
  prospecting_session: z.boolean().default(true).meta({ description: 'Sessão de prospeção (um lead de cada vez)' }),
  launch_checklist: z.boolean().default(true).meta({ description: 'Projetos: checklist de lançamento do site' }),
  collaborators: z.boolean().default(true).meta({ description: 'Projetos: convidar colaboradores' }),
  brand_kit: z.boolean().default(true).meta({ description: 'Kit da marca do cliente (logótipos, cores, tipos de letra, acessos)' }),
  quote_calculator: z.boolean().default(true).meta({ description: 'Calculadora de orçamento' }),
  pomodoro: z.boolean().default(true).meta({ description: 'Projetos: Pomodoro (blocos de trabalho com pausas, no registo de horas)' }),
});
export type Features = z.infer<typeof FeaturesSchema>;
export const DEFAULT_FEATURES: Features = {
  diagnosis_report: true,
  payments: true,
  meetings: true,
  projects: true,
  whatsapp_templates: true,
  revisions: true,
  time_tracking: true,
  deliverables: true,
  client_page: true,
  client_approvals: true,
  project_kickoff: true,
  contracts: true,
  briefing: true,
  expenses: true,
  site_screenshots: true,
  email_tracking: true,
  prospecting_session: true,
  launch_checklist: true,
  collaborators: true,
  brand_kit: true,
  quote_calculator: true,
  pomodoro: true,
};

/** Arranque do projeto: plano de pagamentos criado ao passar a Cliente ([] = sem plano). */
export const KICKOFF_SPLITS = [[50, 50], [30, 40, 30], [100], []] as const;
const PaymentSplitSchema = z
  .array(z.int().min(1).max(100))
  .max(6)
  .refine((s) => !s.length || s.reduce((a, b) => a + b, 0) === 100, { error: 'As percentagens têm de somar 100.' });

/** Condições gerais por omissão dos contratos (editáveis em Definições → Propostas e contratos). */
export const DEFAULT_CONTRACT_CLAUSES = [
  'Conteúdos: o cliente fornece os textos, imagens e acessos necessários. O prazo de entrega conta a partir da receção desses conteúdos.',
  'Alterações: as rondas de revisão incluídas estão indicadas acima. Alterações adicionais ou fora do âmbito são orçamentadas à parte, antes de serem feitas.',
  'Propriedade: após o pagamento integral, o cliente fica com todos os direitos de utilização do trabalho final. Os ficheiros de trabalho e esboços não aprovados continuam a ser do prestador.',
  'Portefólio: o prestador pode mostrar o trabalho no seu portefólio e redes sociais, salvo pedido em contrário do cliente.',
  'Cancelamento: se o cliente cancelar o projeto, os pagamentos já feitos cobrem o trabalho realizado até essa data e não são devolvidos.',
  'Confidencialidade: ambas as partes mantêm confidencial a informação partilhada durante o projeto.',
].join('\n');

/** Perguntas por omissão do briefing online (editáveis em Definições → Funcionalidades). */
export const DEFAULT_BRIEFING_QUESTIONS = [
  'Fale-nos do seu negócio: o que faz e o que o distingue.',
  'Quem são os seus clientes (público-alvo)?',
  'Qual é o principal objetivo deste projeto?',
  'Que cores, tipos de letra ou estilos prefere? E o que não quer?',
  'Referências: sites, marcas ou trabalhos de que gosta (links).',
  'Textos e conteúdos: já os tem ou precisa de ajuda?',
  'Domínio, alojamento e acessos (se for um site): o que já existe?',
  'Há algum prazo ou data importante?',
];

/** Cópia de segurança semanal: os leads em Excel por email. */
export const WeeklyBackupSchema = z.object({
  enabled: z.boolean().default(true),
  /** null = o email de quem fez a última alteração (ou o dono). */
  recipient: z.string().nullable().default(null),
  /** Dia da semana ISO (1 = segunda … 7 = domingo). */
  weekday: z.int().min(1).max(7).default(1),
  last_sent_at: z.string().nullable().default(null),
});
export type WeeklyBackup = z.infer<typeof WeeklyBackupSchema>;
export const DEFAULT_WEEKLY_BACKUP: WeeklyBackup = { enabled: true, recipient: null, weekday: 1, last_sent_at: null };

export const WorkspaceSettingsSchema = z
  .object({
    timezone: z.string().default('Europe/Lisbon'),
    currency: z.string().default('EUR'),
    follow_up_days: z.int().min(1).max(60).default(3),
    /** Sequência de follow-ups por email (depois de um email enviado pela plataforma). */
    follow_up_sequence: FollowUpSequenceSchema.default(DEFAULT_FOLLOW_UP_SEQUENCE),
    /** Arquivar sozinhos os leads em "Sem interesse" há mais de N dias (null = desligado). */
    auto_archive_days: z.int().min(7).max(365).nullable().default(null),
    opt_out_line: z.string().default(''),
    daily_digest: z
      .object({
        enabled: z.boolean().default(false),
        recipient: z.string().nullable().default(null),
      })
      .default({ enabled: false, recipient: null }),
    proposal: z
      .object({
        validity_days: z.int().min(1).max(365).default(30),
        payment_terms: z.string().default('50% na adjudicação e 50% na entrega do site.'),
        tax_note: z.string().default('Valores sem IVA. Acresce IVA à taxa legal em vigor.'),
        next_steps: z
          .string()
          .default('Para avançar, basta responder a este email ou ligar-me. Marcamos uma reunião curta para afinar os detalhes e começo de imediato.'),
      })
      .default({
        validity_days: 30,
        payment_terms: '50% na adjudicação e 50% na entrega do site.',
        tax_note: 'Valores sem IVA. Acresce IVA à taxa legal em vigor.',
        next_steps:
          'Para avançar, basta responder a este email ou ligar-me. Marcamos uma reunião curta para afinar os detalhes e começo de imediato.',
      }),
    features: FeaturesSchema.default(DEFAULT_FEATURES),
    /** Link para os clientes deixarem uma avaliação no Google ({{avaliacao}}). */
    google_review_url: z.string().nullable().default(null),
    /** Arranque automático do projeto (ao passar a Cliente). */
    project_kickoff: z.object({ payment_split: PaymentSplitSchema.default([50, 50]) }).default({ payment_split: [50, 50] }),
    /** Briefing online: as perguntas do formulário. */
    briefing: z.object({ questions: z.array(z.string()).default(DEFAULT_BRIEFING_QUESTIONS) }).default({ questions: DEFAULT_BRIEFING_QUESTIONS }),
    /** Contratos: o teu NIF e as condições gerais. */
    contract: z
      .object({ provider_nif: z.string().default(''), clauses: z.string().default(DEFAULT_CONTRACT_CLAUSES) })
      .default({ provider_nif: '', clauses: DEFAULT_CONTRACT_CLAUSES }),
    weekly_backup: WeeklyBackupSchema.default(DEFAULT_WEEKLY_BACKUP),
    /** Calculadora de orçamento: objetivo por hora e os extras. */
    quote: QuoteSettingsSchema.default(DEFAULT_QUOTE_SETTINGS),
    pomodoro: PomodoroSettingsSchema.default(DEFAULT_POMODORO_SETTINGS),
    team: TeamSettingsSchema.default(DEFAULT_TEAM_SETTINGS),
    /** Fornecedor e modelo de IA de cada função (Definições → Inteligência artificial). */
    ai: AiSettingsSchema.default({
      email: { provider: SERVER_AI_PROVIDER, model: null },
      lead_generation: { provider: SERVER_AI_PROVIDER, model: null },
    }),
  })
  .meta({ id: 'WorkspaceSettings' });
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

export const WorkspaceSettingsUpdateSchema = z
  .object({
    follow_up_days: z.int({ error: 'Indica um número de dias.' }).min(1, { error: 'Mínimo 1 dia.' }).max(60, { error: 'Máximo 60 dias.' }),
    follow_up_sequence: z.object({ enabled: z.boolean(), steps: FollowUpStepsSchema }),
    auto_archive_days: z
      .int({ error: 'Indica um número de dias.' })
      .min(7, { error: 'Mínimo 7 dias.' })
      .max(365, { error: 'Máximo 365 dias.' })
      .nullable(),
    opt_out_line: z.string().trim().max(300),
    daily_digest: z.object({
      enabled: z.boolean(),
      recipient: nullableEmail,
    }),
    proposal: z.object({
      validity_days: z.int({ error: 'Indica um número de dias.' }).min(1, { error: 'Mínimo 1 dia.' }).max(365),
      payment_terms: z.string().trim().max(1000),
      tax_note: z.string().trim().max(500),
      next_steps: z.string().trim().max(1000),
    }),
    ai: AiSettingsUpdateSchema,
    features: FeaturesSchema.partial(),
    google_review_url: nullableUrl,
    project_kickoff: z.object({ payment_split: PaymentSplitSchema }),
    briefing: z.object({
      questions: z
        .array(z.string().trim().min(1).max(300, { error: 'Máximo de 300 caracteres por pergunta.' }))
        .min(1, { error: 'Indica pelo menos uma pergunta.' })
        .max(30, { error: 'Máximo de 30 perguntas.' }),
    }),
    contract: z.object({
      provider_nif: z.string().trim().max(20, { error: 'Máximo de 20 caracteres.' }),
      clauses: z.string().trim().max(5000, { error: 'Máximo de 5000 caracteres.' }),
    }),
    weekly_backup: z.object({
      enabled: z.boolean(),
      recipient: nullableEmail,
      weekday: z.int().min(1).max(7),
    }),
    quote: QuoteSettingsSchema,
    pomodoro: PomodoroSettingsSchema,
    team: TeamSettingsSchema,
  })
  .partial()
  .meta({ id: 'WorkspaceSettingsUpdate' });

export const MeSchema = z
  .object({
    user: z.object({ id: z.uuid(), email: z.string().nullable() }),
    workspace: z.object({ id: z.uuid(), name: z.string(), settings: WorkspaceSettingsSchema }),
    role: z.enum(MEMBER_ROLES),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof MeSchema>;

// -----------------------------------------------------------------------------
// Kanban
// -----------------------------------------------------------------------------
export const LeadMoveSchema = z
  .object({
    status: LeadStatusSchema,
    position: z
      .number()
      .finite()
      .meta({ description: 'Posição na coluna (menor = mais acima). Calcula-se a partir dos vizinhos.' }),
  })
  .meta({ id: 'LeadMove' });
export type LeadMove = z.infer<typeof LeadMoveSchema>;

export const BoardColumnSchema = z
  .object({
    status: LeadStatusSchema,
    total: z.int(),
    value: z.number(),
    leads: z.array(LeadSchema),
  })
  .meta({ id: 'BoardColumn' });
export type BoardColumn = z.infer<typeof BoardColumnSchema>;

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
export const DashboardSchema = z
  .object({
    totals: z.object({
      total: z.int(),
      active: z.int().meta({ description: 'Identificado + Contactado + Respondeu + Reunião + Proposta enviada' }),
      won: z.int(),
      lost: z.int(),
      paused: z.int(),
      archived: z.int().optional(),
      contacted: z.int().meta({ description: 'Leads que já saíram de "Identificado"' }),
      conversion_rate: z.number().meta({ description: 'Clientes ÷ total' }),
      conversion_rate_contacted: z.number().meta({ description: 'Clientes ÷ contactados' }),
      value_total: z.number(),
      value_won: z.number(),
      value_pipeline: z.number(),
    }),
    by_sector: z.array(
      z.object({ id: z.uuid().nullable(), name: z.string(), emoji: z.string().nullable(), count: z.int(), value: z.number() }),
    ),
    by_status: z.array(z.object({ status: LeadStatusSchema, count: z.int() })),
    by_service: z
      .array(z.object({ service: z.string(), count: z.int(), won: z.int() }))
      .optional()
      .meta({ description: 'Leads com interesse em cada serviço e quantos são clientes' }),
    by_channel: z.array(z.object({ channel: LeadChannelSchema.nullable(), count: z.int() })),
    funnel: z.array(z.object({ stage: LeadStatusSchema, count: z.int() })),
    weekly: z.array(z.object({ week_start: z.string(), count: z.int() })),
  })
  .meta({ id: 'Dashboard' });
export type Dashboard = z.infer<typeof DashboardSchema>;

export const TodaySchema = z
  .object({
    today: z.string(),
    overdue: z.array(LeadSchema),
    due_today: z.array(LeadSchema),
    upcoming: z.array(LeadSchema).meta({ description: 'Próximos 7 dias' }),
    tasks: TodayTasksSchema.optional().meta({ description: 'Tarefas com prazo (em atraso, hoje e próximos 7 dias)' }),
    hot: z.array(LeadSchema).optional().meta({ description: 'Leads com maior prioridade (os mais quentes), em pipeline' }),
    meetings: z.array(TodayMeetingSchema).optional().meta({ description: 'Reuniões de hoje e dos próximos 7 dias' }),
    opened: z.array(TodayOpenedEmailSchema).optional().meta({ description: 'Leads que abriram um email nas últimas 48 horas' }),
  })
  .meta({ id: 'Today' });
export type Today = z.infer<typeof TodaySchema>;

// -----------------------------------------------------------------------------
// Modelos de contacto, assinatura e follow-up (Fase C)
// -----------------------------------------------------------------------------
export const TemplateKindSchema = z.enum(TEMPLATE_KINDS).meta({ id: 'TemplateKind' });

export const ContactTemplateSchema = z
  .object({
    id: z.uuid(),
    kind: TemplateKindSchema,
    name: z.string(),
    subject: z.string().nullable(),
    body: z.string(),
    sector_id: z.uuid().nullable(),
    category: z.string().nullable().meta({ description: 'Categoria de serviço (vazio = todas)' }),
    is_default: z.boolean(),
    sort_order: z.int(),
    updated_at: z.string(),
  })
  .meta({ id: 'ContactTemplate' });
export type ContactTemplate = z.infer<typeof ContactTemplateSchema>;

const templateFields = {
  kind: TemplateKindSchema,
  name: z.string().trim().min(1, { error: 'Indica o nome do modelo.' }).max(120),
  subject: nullableText(300),
  body: z.string().max(20_000, { error: 'Texto demasiado longo.' }),
  sector_id: z.uuid().nullable(),
  category: ServiceCategoryKeySchema.nullable(),
  is_default: z.boolean(),
  sort_order: z.int().min(0).max(9999),
};

export const ContactTemplateCreateSchema = z
  .object(templateFields)
  .partial()
  .required({ kind: true, name: true, body: true })
  .meta({ id: 'ContactTemplateCreate' });
export type ContactTemplateCreateInput = z.input<typeof ContactTemplateCreateSchema>;

export const ContactTemplateUpdateSchema = z.object(templateFields).partial().meta({ id: 'ContactTemplateUpdate' });

export const SignatureSchema = z
  .object({
    full_name: z.string(),
    role_title: z.string().nullable(),
    company: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    website: z.string().nullable(),
    portfolio_url: z.string().nullable(),
    design_portfolio_url: z.string().nullable().optional(),
    project_links: z.array(z.string()),
  })
  .meta({ id: 'Signature' });
export type Signature = z.infer<typeof SignatureSchema>;

export const SignatureUpdateSchema = z
  .object({
    full_name: z.string().trim().min(1, { error: 'Indica o teu nome.' }).max(120),
    role_title: nullableText(120),
    company: nullableText(120),
    phone: nullableText(40),
    email: nullableEmail,
    website: nullableUrl,
    portfolio_url: nullableUrl,
    design_portfolio_url: nullableUrl.optional(),
    project_links: z
      .array(z.string().trim().max(500))
      .max(10)
      .transform((links) => links.filter(Boolean))
      .pipe(z.array(z.url({ protocol: /^https?$/, error: 'Link inválido.' }))),
  })
  .partial()
  .meta({ id: 'SignatureUpdate' });

export const RenderTemplateRequestSchema = z
  .object({
    template_id: z.uuid().optional(),
    subject: z.string().max(300).optional(),
    body: z.string().max(20_000).optional(),
  })
  .refine((v) => v.template_id || v.body !== undefined, { error: 'Indica template_id ou body.' })
  .meta({ id: 'RenderTemplateRequest' });

export const RenderedTemplateSchema = z
  .object({
    template_id: z.uuid().nullable(),
    subject: z.string(),
    body: z.string(),
    missing: z.array(z.string()),
    unknown: z.array(z.string()),
  })
  .meta({ id: 'RenderedTemplate' });
export type RenderedTemplate = z.infer<typeof RenderedTemplateSchema>;

export const FollowUpSchema = z
  .object({
    action: z.enum(['done', 'snooze']).meta({ description: 'done = follow-up feito; snooze = adiar a próxima ação' }),
    days: z
      .int()
      .min(1)
      .max(60)
      .nullish()
      .meta({ description: 'Dias até à próxima ação (done: agenda nova; snooze: adia). Vazio em "done" = sem próxima ação.' }),
    note: nullableText(2000).optional(),
  })
  .meta({ id: 'FollowUp' });
export type FollowUpInput = z.infer<typeof FollowUpSchema>;
