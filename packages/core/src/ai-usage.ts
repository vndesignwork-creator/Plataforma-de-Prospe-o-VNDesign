/**
 * Consumo da IA (Definições → Inteligência artificial → Consumo e créditos): cada chamada fica
 * registada com os tokens e um custo estimado pelo preço de tabela; com o valor carregado,
 * a plataforma mostra quanto resta (estimativa) e avisa quando está a acabar.
 */
import { z } from 'zod';

/** Preço de tabela (USD por milhão de tokens): Anthropic em 3/11/2026 e OpenAI (os conhecidos). */
export const AI_PRICES: Record<string, { input: number; output: number }> = {
  'claude-fable-5-2': { input: 8, output: 40 },
  'claude-mythos-5-2': { input: 8, output: 40 },
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-mythos-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // OpenAI (preço de tabela conhecido; os modelos mais novos contam pelo da família, ex.: "gpt-5.1" como "gpt-5").
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'o3': { input: 2, output: 8 },
  'o4-mini': { input: 1.1, output: 4.4 },
};
/** Pesquisa na internet (ferramenta da Anthropic): 10 USD por 1000 pesquisas. */
export const WEB_SEARCH_PRICE_USD = 10 / 1000;

export interface AiTokenUsage {
  input_tokens: number;
  /** Escritos na cache (custam 1,25× a entrada). */
  cache_write_tokens?: number;
  /** Lidos da cache (custam 0,1× a entrada). */
  cache_read_tokens?: number;
  output_tokens: number;
  searches?: number;
}

/** O preço de um modelo (o nome exato, ou o mais comprido que encaixe: "claude-opus-5-5-…"). */
export function aiPrice(model: string): { input: number; output: number } | null {
  // OpenRouter: "anthropic/claude-…", "openai/gpt-…".
  const id = model.trim().toLowerCase().replace(/^(anthropic|openai)\//, '');
  if (AI_PRICES[id]) return AI_PRICES[id];
  const match = Object.keys(AI_PRICES)
    .filter((k) => id.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? AI_PRICES[match]! : null;
}

/** Custo estimado em USD (null: modelo sem preço conhecido, ex.: OpenAI ou um modelo próprio). */
export function estimateAiCost(model: string, usage: AiTokenUsage): number | null {
  const price = aiPrice(model);
  if (!price) return null;
  const input = usage.input_tokens * price.input + (usage.cache_write_tokens ?? 0) * price.input * 1.25 + (usage.cache_read_tokens ?? 0) * price.input * 0.1;
  const cost = (input + usage.output_tokens * price.output) / 1_000_000 + (usage.searches ?? 0) * WEB_SEARCH_PRICE_USD;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Para que serviu cada chamada (pelo nome do formato pedido à IA). */
export const AI_FEATURE_LABELS: Record<string, string> = {
  email: 'Emails com IA',
  resposta: 'Respostas a objeções',
  respostas: 'Aparece nas IAs?',
  perguntas_frequentes: 'Perguntas frequentes (GEO)',
  perfis: 'Perfis (GEO)',
  resumo_lead: 'Resumo do lead',
  lead_ditado: 'Lead ditado',
  notas_reuniao: 'Notas da reunião',
  cartao_visita: 'Cartão de visita (foto)',
  empresas: 'Gerador de leads',
  categorias: 'Categorias de serviços',
};
export const aiFeatureLabel = (key: string) => AI_FEATURE_LABELS[key] ?? 'Outros';

/** O valor carregado no fornecedor (para estimar quanto resta). */
export const AiCreditSchema = z
  .object({
    /** Quanto carregaste (USD); null = não indicado. */
    amount_usd: z.number().min(0).max(100_000).nullable().default(null),
    /** Desde quando conta o gasto (quando indicaste o valor). */
    since: z.string().nullable().default(null),
    /** Avisar quando restar menos do que isto (USD). */
    alert_below_usd: z.number().min(0).max(100_000).nullable().default(null),
    /** Último aviso de "créditos a acabar" (um por carregamento). */
    alerted_at: z.string().nullable().default(null),
  })
  .meta({ id: 'AiCredit' });
export type AiCredit = z.infer<typeof AiCreditSchema>;
export const DEFAULT_AI_CREDIT: AiCredit = { amount_usd: null, since: null, alert_below_usd: null, alerted_at: null };

/** Os fornecedores que têm saldo próprio (cada chave é uma conta separada). */
export const AI_CREDIT_KINDS = ['anthropic', 'openai', 'openrouter', 'custom'] as const;
export type AiCreditKind = (typeof AI_CREDIT_KINDS)[number];
export const AiCreditsSchema = z.partialRecord(z.enum(AI_CREDIT_KINDS), AiCreditSchema).meta({ id: 'AiCredits' });
export type AiCredits = z.infer<typeof AiCreditsSchema>;

export const AI_CREDIT_META: Record<AiCreditKind, { label: string; console: string | null }> = {
  anthropic: { label: 'Claude (Anthropic)', console: 'https://platform.claude.com/settings/billing' },
  openai: { label: 'ChatGPT (OpenAI)', console: 'https://platform.openai.com/settings/organization/billing/overview' },
  openrouter: { label: 'OpenRouter', console: 'https://openrouter.ai/settings/credits' },
  custom: { label: 'Outro fornecedor', console: null },
};

/** Os saldos de cada fornecedor (o valor antigo, de antes de haver um por fornecedor, conta como o da Anthropic). */
export function creditsOf(settings: { ai_credit?: AiCredit | null; ai_credits?: AiCredits | null }): AiCredits {
  const credits: AiCredits = { ...(settings.ai_credits ?? {}) };
  if (!credits.anthropic && settings.ai_credit && settings.ai_credit.amount_usd !== null) credits.anthropic = settings.ai_credit;
  return credits;
}

export const AiCreditUpdateSchema = z
  .object({
    /** De que fornecedor é o saldo (por omissão, a Anthropic). */
    provider: z.enum(AI_CREDIT_KINDS).default('anthropic'),
    amount_usd: z.number({ error: 'Indica um valor.' }).min(0).max(100_000).nullable(),
    alert_below_usd: z.number().min(0).max(100_000).nullable().optional(),
    /** true: começa a contar o gasto a partir de agora (acabaste de carregar). */
    reset: z.boolean().optional(),
  })
  .meta({ id: 'AiCreditUpdate' });

const CreditRow = z.object({
  kind: z.enum(AI_CREDIT_KINDS),
  label: z.string(),
  amount_usd: z.number().nullable(),
  since: z.string().nullable(),
  spent_since_usd: z.number(),
  remaining_usd: z.number().nullable(),
  alert_below_usd: z.number().nullable(),
  /** Gasto deste fornecedor no mês escolhido. */
  spent_month_usd: z.number(),
  /** Onde ver o saldo exato (null: sem consola conhecida). */
  console_url: z.string().nullable(),
});

const Row = z.object({ key: z.string(), label: z.string(), calls: z.int(), cost_usd: z.number(), tokens: z.int() });
export const AiUsageSummarySchema = z
  .object({
    month: z.string(),
    total_usd: z.number(),
    previous_month_usd: z.number(),
    calls: z.int(),
    /** Chamadas sem preço conhecido (ex.: OpenAI): não entram no total. */
    unpriced_calls: z.int(),
    by_feature: z.array(Row),
    by_user: z.array(Row),
    by_model: z.array(Row),
    /** Um saldo por fornecedor com chave ligada (cada um é uma conta separada: não se somam). */
    credits: z.array(CreditRow),
  })
  .meta({ id: 'AiUsageSummary' });
export type AiUsageSummary = z.infer<typeof AiUsageSummarySchema>;
