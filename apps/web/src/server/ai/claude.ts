/**
 * Cliente da API da Anthropic (Claude) — só no servidor.
 * ANTHROPIC_API_KEY obrigatória; ANTHROPIC_MODEL opcional (por omissão claude-opus-5-5).
 * AI_BASE_URL só para testes (servidor falso em e2e/stubs.ts).
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

/** Chave sem espaços, quebras de linha ou aspas à volta (erros comuns ao colar). */
export function aiApiKey(): string | null {
  const key = (process.env.ANTHROPIC_API_KEY ?? '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
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

let client: { key: string; instance: Anthropic } | null = null;
export function anthropicClient(): Anthropic {
  const key = aiApiKey() ?? '';
  // Recria o cliente se a chave mudar (ex.: corrigida no .env.local).
  if (!client || client.key !== key) {
    // 55 s por pedido e uma repetição: cabe no limite de 60 s das funções do Vercel.
    client = {
      key,
      instance: new Anthropic({ apiKey: key, baseURL: process.env.AI_BASE_URL || undefined, timeout: 55_000, maxRetries: 1 }),
    };
  }
  return client.instance;
}

/** Mensagem da API da Anthropic (ex.: "invalid x-api-key"), para mostrar no erro. */
export function anthropicErrorMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? error.message;
}
