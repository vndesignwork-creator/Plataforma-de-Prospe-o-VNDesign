import { describe, expect, it } from 'vitest';
import { creditsOf, estimateAiCost } from '../src/ai-usage';

describe('custo estimado da IA', () => {
  it('Claude: entrada, saída, cache e pesquisas', () => {
    expect(estimateAiCost('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(6, 6);
    expect(estimateAiCost('claude-sonnet-5-5', { input_tokens: 0, cache_read_tokens: 1_000_000, output_tokens: 0, searches: 2 })).toBeCloseTo(0.22, 6);
  });
  it('OpenAI e OpenRouter pelo nome do modelo; modelo desconhecido sem preço', () => {
    expect(estimateAiCost('gpt-5-mini-2025-08-07', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.25, 6);
    expect(estimateAiCost('openai/gpt-4o-mini', { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(0.6, 6);
    expect(estimateAiCost('llama-3-70b', { input_tokens: 1000, output_tokens: 1000 })).toBeNull();
  });
  it('o saldo antigo (um só) passa a ser o da Anthropic', () => {
    const old = { amount_usd: 5.51, since: '2026-11-13T00:00:00Z', alert_below_usd: null, alerted_at: null };
    expect(creditsOf({ ai_credit: old, ai_credits: {} })).toEqual({ anthropic: old });
    expect(creditsOf({ ai_credit: { ...old, amount_usd: null }, ai_credits: { openai: old } })).toEqual({ openai: old });
  });
});
