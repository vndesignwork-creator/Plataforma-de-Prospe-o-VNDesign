/**
 * Cliente da API da Anthropic (Claude) — só no servidor.
 * ANTHROPIC_API_KEY obrigatória; ANTHROPIC_MODEL opcional (por omissão claude-opus-5-5).
 * AI_BASE_URL só para testes (servidor falso em e2e/stubs.ts).
 */
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL;
}

let client: Anthropic | null = null;
export function anthropicClient(): Anthropic {
  // 55 s por pedido e uma repetição: cabe no limite de 60 s das funções do Vercel.
  client ??= new Anthropic({ baseURL: process.env.AI_BASE_URL || undefined, timeout: 55_000, maxRetries: 1 });
  return client;
}
