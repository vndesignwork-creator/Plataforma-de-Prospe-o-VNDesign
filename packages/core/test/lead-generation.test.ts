import { describe, expect, it } from 'vitest';
import {
  LeadGenerationRequestSchema,
  buildLeadGenerationPrompt,
  estimateLeadGenerationCost,
} from '../src/lead-generation';
import { DEFAULT_SERVICES } from '../src/services';

describe('gerador de leads', () => {
  it('valida o pedido com valores por omissão', () => {
    const req = LeadGenerationRequestSchema.parse({ query: '  cafés sem site  ' });
    expect(req).toEqual({ query: 'cafés sem site', city: null, sector_id: null, services: [], max_results: 15 });
    expect(LeadGenerationRequestSchema.safeParse({ query: 'x' }).success).toBe(false);
    expect(LeadGenerationRequestSchema.safeParse({ query: 'cafés', max_results: 99 }).success).toBe(false);
  });

  it('o prompt leva o pedido delimitado, os serviços escolhidos e os leads a não repetir', () => {
    const request = LeadGenerationRequestSchema.parse({ query: 'clínicas', city: 'Amadora', services: ['identidade_visual'] });
    const prompt = buildLeadGenerationPrompt({
      request,
      sectorName: 'Saúde / Clínica',
      sectors: ['Restauração', 'Saúde / Clínica'],
      services: DEFAULT_SERVICES,
      existingNames: ['Clínica Sorriso'],
    });
    expect(prompt).toContain('<pedido>clínicas</pedido>');
    expect(prompt).toContain('Zona: Amadora');
    expect(prompt).toContain('identidade_visual — Identidade Visual');
    expect(prompt).not.toContain('landing_page');
    expect(prompt).toContain('Já são leads (não repetir): Clínica Sorriso');
  });

  it('custo estimado: tokens + 10 $ por 1000 pesquisas', () => {
    expect(estimateLeadGenerationCost('claude-sonnet-5-5', { input_tokens: 100_000, output_tokens: 10_000, searches: 10 })).toBe(0.4);
    expect(estimateLeadGenerationCost('modelo-desconhecido', { input_tokens: 1, output_tokens: 1, searches: 1 })).toBeNull();
  });
});
