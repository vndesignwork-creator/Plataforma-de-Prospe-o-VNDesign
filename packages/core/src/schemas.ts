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
} from './enums';
import { ensureUrlProtocol } from './normalize';

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
  .object({ id: z.uuid(), name: z.string(), slug: z.string(), emoji: z.string().nullable() })
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
    notes: z.string().nullable(),
    approach_angle: z.string().nullable(),
    source_url: z.string().nullable(),
    suggested_on: z.string().nullable(),
    email_subject: z.string().nullable(),
    email_body: z.string().nullable(),
    kanban_position: z.number(),
    status_changed_at: z.string(),
    anonymized_at: z.string().nullable(),
    created_by: z.uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'Lead' });
export type Lead = z.infer<typeof LeadSchema>;

export const LEAD_SORT_FIELDS = [
  'number',
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

export const LeadListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional().meta({ description: 'Pesquisa em nome, cidade, contacto, email, website, problemas e notas' }),
    sector: csvList(z.union([z.uuid(), z.literal('none')])).optional().meta({ description: 'IDs de setor separados por vírgula ("none" = sem setor)' }),
    status: csvList(LeadStatusSchema).optional(),
    channel: csvList(z.union([LeadChannelSchema, z.literal('none')])).optional(),
    city: z.string().trim().max(120).optional(),
    suggested_from: z.iso.date().optional(),
    suggested_to: z.iso.date().optional(),
    due: z
      .enum(['overdue', 'today', 'week'])
      .optional()
      .meta({ description: 'Próxima ação em atraso, para hoje ou nos próximos 7 dias' }),
    include_anonymized: z.enum(['true', 'false']).optional(),
    sort: z.enum(LEAD_SORT_FIELDS).default('number'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .meta({ id: 'LeadListQuery' });
export type LeadListQuery = z.output<typeof LeadListQuerySchema>;

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
    opt_out_line: z.string().default(''),
  })
  .meta({ id: 'WorkspaceSettings' });

export const MeSchema = z
  .object({
    user: z.object({ id: z.uuid(), email: z.string().nullable() }),
    workspace: z.object({ id: z.uuid(), name: z.string(), settings: WorkspaceSettingsSchema }),
    role: z.enum(['owner', 'admin', 'member']),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof MeSchema>;
