/**
 * Consumo da IA (Definições → Inteligência artificial → Consumo e créditos): cada chamada fica
 * registada com os tokens e um custo estimado pelo preço de tabela; com o valor carregado,
 * a plataforma mostra quanto resta (estimativa) e avisa quando está a acabar.
 */
import { z } from 'zod';

/** Preço de tabela da Anthropic (USD por milhão de tokens), em 3/11/2026. */
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
  const id = model.trim().toLowerCase().replace(/^anthropic\//, '');
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

export const AiCreditUpdateSchema = z
  .object({
    amount_usd: z.number({ error: 'Indica um valor.' }).min(0).max(100_000).nullable(),
    alert_below_usd: z.number().min(0).max(100_000).nullable().optional(),
    /** true: começa a contar o gasto a partir de agora (acabaste de carregar). */
    reset: z.boolean().optional(),
  })
  .meta({ id: 'AiCreditUpdate' });

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
    credit: z.object({
      amount_usd: z.number().nullable(),
      since: z.string().nullable(),
      spent_since_usd: z.number(),
      remaining_usd: z.number().nullable(),
      alert_below_usd: z.number().nullable(),
    }),
    /** Onde ver o saldo exato de cada fornecedor usado. */
    consoles: z.array(z.object({ label: z.string(), url: z.string() })),
  })
  .meta({ id: 'AiUsageSummary' });
export type AiUsageSummary = z.infer<typeof AiUsageSummarySchema>;
