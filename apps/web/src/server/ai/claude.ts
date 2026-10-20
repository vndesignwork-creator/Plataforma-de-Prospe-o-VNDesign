/**
 * Cliente da API da Anthropic (Claude) — só no servidor.
 * ANTHROPIC_API_KEY obrigatória; ANTHROPIC_MODEL opcional (por omissão claude-opus-5-5).
 * AI_BASE_URL só para testes (servidor falso em e2e/stubs.ts).
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

/**
 * Chave sem aspas, espaços, quebras de linha ou carateres invisíveis (erros
 * comuns ao colar). As chaves da Anthropic só têm carateres ASCII visíveis.
 */
export function aiApiKey(): string | null {
  const key = (process.env.ANTHROPIC_API_KEY ?? '').replace(/["'“”‘’]/g, '').replace(/[^\x21-\x7E]/g, '');
  return key || null;
}

export function isAiConfigured(): boolean {
  return aiApiKey() !== null;
}

/** Início e fim da chave, para confirmar qual está a ser usada sem a mostrar. */
export function aiKeyHint(): string | null {
  const key = aiApiKey();
  return key ? `${key.slice(0, 10)}…${key.slice(-4)} (${key.length} carateres)` : null;
}

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL;
}

const clients = new Map<string, Anthropic>();

/**
 * Cliente da Anthropic para uma chave (a do servidor ou uma das Definições).
 * Normal: 55 s por pedido e uma repetição. Longo (gerador de leads, que pesquisa
 * durante 1–3 minutos em segundo plano): 5 minutos.
 */
export function anthropicClientFor(key: string, options: { long?: boolean } = {}): Anthropic {
  const cacheKey = `${options.long ? 'long' : 'short'}:${key}`;
  let instance = clients.get(cacheKey);
  if (!instance) {
    // Endereço fixo: uma ANTHROPIC_BASE_URL definida no sistema (por outra ferramenta) não é usada.
    instance = new Anthropic({
      apiKey: key,
      authToken: null,
      baseURL: process.env.AI_BASE_URL || 'https://api.anthropic.com',
      timeout: options.long ? 5 * 60_000 : 55_000,
      maxRetries: 1,
    });
    if (clients.size > 20) clients.clear();
    clients.set(cacheKey, instance);
  }
  return instance;
}

export function anthropicClient(): Anthropic {
  return anthropicClientFor(aiApiKey() ?? '');
}

export function anthropicLongClient(): Anthropic {
  return anthropicClientFor(aiApiKey() ?? '', { long: true });
}

/** Mensagem da API da Anthropic (ex.: "invalid x-api-key"), para mostrar no erro. */
export function anthropicErrorMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? error.message;
}
