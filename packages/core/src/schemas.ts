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
import { SERVICE_KEYS } from './services';

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
  /** Serviços de interesse (Web Design e/ou Design Gráfico). */
  services: z
    .array(z.enum(SERVICE_KEYS, { error: 'Serviço desconhecido.' }))
    .max(SERVICE_KEYS.length)
    .transform((list) => SERVICE_KEYS.filter((k) => list.includes(k))),
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
    services: z.array(z.enum(SERVICE_KEYS)).optional(),
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
    created_by: z.uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'Lead' });
export type Lead = z.infer<typeof LeadSchema>;

export const LEAD_SORT_FIELDS = [
  'number',
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
    service: csvList(z.union([z.enum(SERVICE_KEYS), z.literal('none')]))
      .optional()
      .meta({ description: 'Serviços de interesse separados por vírgula ("none" = sem serviço); basta um coincidir' }),
    city: z.string().trim().max(120).optional(),
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
export const LEAD_BULK_ACTIONS = ['archive', 'restore', 'delete'] as const;
export type LeadBulkAction = (typeof LEAD_BULK_ACTIONS)[number];

export const LeadBulkActionSchema = z
  .object({
    action: z.enum(LEAD_BULK_ACTIONS).meta({ description: 'archive = arquivar, restore = repor do arquivo, delete = apagar' }),
    ids: z.array(z.uuid()).min(1, { error: 'Escolhe pelo menos um lead.' }).max(200, { error: 'No máximo 200 leads de cada vez.' }),
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

export const WorkspaceSettingsSchema = z
  .object({
    timezone: z.string().default('Europe/Lisbon'),
    currency: z.string().default('EUR'),
    follow_up_days: z.int().min(1).max(60).default(3),
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
  })
  .meta({ id: 'WorkspaceSettings' });
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

export const WorkspaceSettingsUpdateSchema = z
  .object({
    follow_up_days: z.int({ error: 'Indica um número de dias.' }).min(1, { error: 'Mínimo 1 dia.' }).max(60, { error: 'Máximo 60 dias.' }),
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
  })
  .partial()
  .meta({ id: 'WorkspaceSettingsUpdate' });

export const MeSchema = z
  .object({
    user: z.object({ id: z.uuid(), email: z.string().nullable() }),
    workspace: z.object({ id: z.uuid(), name: z.string(), settings: WorkspaceSettingsSchema }),
    role: z.enum(['owner', 'admin', 'member']),
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
      .array(z.object({ service: z.enum(SERVICE_KEYS), count: z.int(), won: z.int() }))
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
