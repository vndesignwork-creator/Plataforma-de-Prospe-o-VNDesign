/**
 * API de integração: tokens pessoais ("vnd_…"), importação de leads em JSON
 * (POST /leads/import — por exemplo, a tarefa semanal de prospeção com o
 * Claude) e subscrições de notificações push.
 */
import { z } from 'zod';
import {
  IMPORT_FIELDS,
  mapImportRow,
  type ImportField,
  type ImportSectorRef,
  type MapRowResult,
} from './import';

// -----------------------------------------------------------------------------
// Tokens
// -----------------------------------------------------------------------------
export const API_TOKEN_SCOPES = ['leads:import', 'leads:read', 'leads:write'] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];
export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScope, string> = {
  'leads:import': 'Importar leads (POST /leads/import)',
  'leads:read': 'Ler leads e setores',
  'leads:write': 'Criar e editar leads',
};
export const API_TOKEN_PREFIX = 'vnd_';

export const ApiTokenSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    prefix: z.string().meta({ description: 'Início do token, para o reconhecer (ex.: "vnd_a1b2c3")' }),
    scopes: z.array(z.enum(API_TOKEN_SCOPES)),
    last_used_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: 'ApiToken' });
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const ApiTokenCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Dá um nome ao token.').max(80),
    scopes: z
      .array(z.enum(API_TOKEN_SCOPES))
      .min(1, 'Escolhe pelo menos uma permissão.')
      .default(['leads:import']),
    expires_in_days: z
      .int()
      .min(1)
      .max(730)
      .nullable()
      .default(365)
      .meta({ description: 'Validade em dias (null = sem validade)' }),
  })
  .meta({ id: 'ApiTokenCreate' });
export type ApiTokenCreate = z.input<typeof ApiTokenCreateSchema>;

export const ApiTokenCreatedSchema = ApiTokenSchema.extend({
  token: z.string().meta({ description: 'Token completo — só é mostrado agora' }),
}).meta({ id: 'ApiTokenCreated' });
export type ApiTokenCreated = z.infer<typeof ApiTokenCreatedSchema>;

// -----------------------------------------------------------------------------
// POST /leads/import
// -----------------------------------------------------------------------------
export const MAX_API_IMPORT_LEADS = 500;

export const IntegrationImportSchema = z
  .object({
    source: z
      .string()
      .trim()
      .max(80)
      .optional()
      .meta({ description: 'Identifica a origem no histórico (ex.: "claude-semanal")' }),
    on_duplicate: z
      .enum(['skip', 'merge', 'create'])
      .default('skip')
      .meta({ description: 'skip = ignora; merge = preenche os campos vazios do lead existente; create = cria na mesma' }),
    dry_run: z.boolean().default(false).meta({ description: 'Valida e mostra o resultado sem gravar' }),
    leads: z
      .array(z.record(z.string(), z.unknown()))
      .min(1, 'Envia pelo menos um lead.')
      .max(MAX_API_IMPORT_LEADS, `Máximo de ${MAX_API_IMPORT_LEADS} leads por pedido.`),
  })
  .meta({ id: 'IntegrationImport' });
export type IntegrationImport = z.infer<typeof IntegrationImportSchema>;

export const INTEGRATION_RESULTS = ['created', 'merged', 'skipped_duplicate', 'blocked_dnc', 'invalid'] as const;
export type IntegrationResult = (typeof INTEGRATION_RESULTS)[number];

export const IntegrationImportItemSchema = z.object({
  index: z.int(),
  result: z.enum(INTEGRATION_RESULTS),
  /** Em dry_run: o que aconteceria. */
  would: z.boolean(),
  company_name: z.string().nullable(),
  lead_id: z.uuid().nullable(),
  number: z.int().nullable(),
  duplicate_of: z
    .array(z.object({ lead_id: z.uuid(), number: z.int(), company_name: z.string(), reasons: z.array(z.string()) }))
    .optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});
export type IntegrationImportItem = z.infer<typeof IntegrationImportItemSchema>;

export const IntegrationImportResultSchema = z
  .object({
    job_id: z.uuid().nullable(),
    dry_run: z.boolean(),
    replayed: z.boolean().meta({ description: 'true se a resposta veio de um pedido anterior com o mesmo Idempotency-Key' }),
    summary: z.object({
      total: z.int(),
      created: z.int(),
      merged: z.int(),
      skipped_duplicate: z.int(),
      blocked_dnc: z.int(),
      invalid: z.int(),
    }),
    results: z.array(IntegrationImportItemSchema),
  })
  .meta({ id: 'IntegrationImportResult' });
export type IntegrationImportResult = z.infer<typeof IntegrationImportResultSchema>;

/** Nomes alternativos aceites no JSON (além dos nomes de IMPORT_FIELDS). */
const JSON_ALIASES: Record<string, ImportField> = {
  name: 'company_name',
  company: 'company_name',
  empresa: 'company_name',
  sector_name: 'sector',
  setor: 'sector',
  url: 'website',
  site: 'website',
  cidade: 'city',
  telefone: 'phone',
  next_action_text: 'next_action',
  value: 'estimated_value',
  pagespeed_mobile: 'pagespeed',
  source_link: 'source_url',
  fonte: 'source_url',
};

function toCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return '';
}

/**
 * Converte um lead em JSON (chaves como na documentação, com valores à moda da
 * folha: "🔍 Identificado", "Sim", "06/10/2026", "1.200 €"…) usando as mesmas
 * regras da importação de ficheiros.
 */
export function mapIntegrationLead(input: Record<string, unknown>, sectors: readonly ImportSectorRef[]): MapRowResult {
  const row: string[] = Array(IMPORT_FIELDS.length).fill('');
  const unknown: string[] = [];
  for (const [rawKey, value] of Object.entries(input)) {
    const key = rawKey.trim().toLowerCase();
    const field = (IMPORT_FIELDS as readonly string[]).includes(key) ? (key as ImportField) : JSON_ALIASES[key];
    if (!field || field === 'number') {
      if (field !== 'number') unknown.push(rawKey);
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      unknown.push(rawKey);
      continue;
    }
    row[IMPORT_FIELDS.indexOf(field)] = toCell(value);
  }
  const result = mapImportRow(row, IMPORT_FIELDS, sectors);
  if (unknown.length) {
    const warning = `Campos ignorados: ${unknown.join(', ')}.`;
    if (result.ok) result.value.warnings.push(warning);
    else result.warnings.push(warning);
  }
  return result;
}

// -----------------------------------------------------------------------------
// Notificações push
// -----------------------------------------------------------------------------
/**
 * Serviços de push dos browsers (Chrome/Edge/Opera, Firefox, Windows, Safari).
 * O servidor faz pedidos para o endpoint registado, por isso não se aceita
 * outro endereço (evita usar o servidor para chegar a máquinas internas).
 */
const PUSH_SERVICE_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/i;

export function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.port === '' && PUSH_SERVICE_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

export const PushSubscriptionCreateSchema = z
  .object({
    endpoint: z
      .url()
      .max(2000)
      .refine(isPushServiceUrl, 'Endereço de notificações desconhecido: tem de ser o serviço de push de um browser.'),
    keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
  })
  .meta({ id: 'PushSubscriptionCreate' });
export type PushSubscriptionCreate = z.infer<typeof PushSubscriptionCreateSchema>;

export const PushSubscriptionDeleteSchema = z
  .object({ endpoint: z.url().max(2000) })
  .meta({ id: 'PushSubscriptionDelete' });
