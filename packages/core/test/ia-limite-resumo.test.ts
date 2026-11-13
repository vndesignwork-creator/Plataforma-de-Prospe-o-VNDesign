import { describe, expect, it } from 'vitest';
import { AiSettingsSchema, aiFunctionSetting, buildWeeklyReport, cheaperAiModel, type WeeklyReportData } from '../src';

describe('modelo de cada função', () => {
  it('sem escolha própria, segue o "Email com IA"', () => {
    const ai = AiSettingsSchema.parse({ email: { provider: 'p1', model: 'claude-opus-5-5' }, summary: { provider: 'server', model: 'claude-haiku-5-5' } });
    expect(aiFunctionSetting(ai, 'summary')).toEqual({ provider: 'server', model: 'claude-haiku-5-5' });
    expect(aiFunctionSetting(ai, 'objections')).toEqual({ provider: 'p1', model: 'claude-opus-5-5' });
    expect(ai.geo).toBeNull();
  });

  it('o modelo mais barato do mesmo fornecedor', () => {
    expect(cheaperAiModel('claude-opus-5-5')).toBe('claude-haiku-5-5');
    expect(cheaperAiModel('anthropic/claude-sonnet-5-5')).toBe('anthropic/claude-haiku-5-5');
    expect(cheaperAiModel('gpt-5')).toBe('gpt-5-mini');
    expect(cheaperAiModel('claude-haiku-5-5')).toBeNull();
    expect(cheaperAiModel('gpt-5-nano')).toBeNull();
    expect(cheaperAiModel('llama-3')).toBeNull();
  });
});

describe('resumo da semana', () => {
  const base: WeeklyReportData = {
    from: '2026-11-02',
    to: '2026-11-08',
    new_leads: 12,
    by_origin: [{ label: 'Formulário do site', count: 7 }, { label: 'Prospeção', count: 5 }],
    contacted: 9,
    replied: 3,
    proposals: 2,
    won: 1,
    received: 750,
    sites: { down: [{ name: 'Padaria Sol', checks: 3 }], slow: [{ name: 'Café Lua', ms: 4200 }] },
    ai: { spent_usd: 1.234, month_usd: 4.5, budget_usd: 10 },
    problems: [{ title: 'O resumo diário não saiu', count: 2 }],
    url: 'https://leads.vndesign.pt',
  };

  it('junta a semana num email (texto e HTML)', () => {
    const r = buildWeeklyReport(base);
    expect(r.subject).toBe('Resumo da semana — 02/11 a 08/11');
    expect(r.text).toContain('12 leads novos');
    expect(r.text).toContain('Formulário do site 7 · Prospeção 5');
    expect(r.text).toContain('🤝 1 cliente novo');
    expect(r.text).toContain('Padaria Sol: esteve em baixo (3 verificações)');
    expect(r.text).toContain('Café Lua: lento (4,2 s em média)');
    expect(r.text).toContain('Esta semana: 1,23 $ · este mês: 4,50 $ de 10,00 $ (limite)');
    expect(r.text).toContain('O resumo diário não saiu (2 vezes)');
    expect(r.html).toContain('<h3');
  });

  it('semana calma: sem clientes, sites bem e sem problemas', () => {
    const r = buildWeeklyReport({ ...base, won: 0, received: null, sites: { down: [], slow: [] }, problems: [], ai: { spent_usd: 0, month_usd: 0, budget_usd: null } });
    expect(r.text).toContain('Sem clientes novos esta semana.');
    expect(r.text).toContain('Todos no ar e rápidos.');
    expect(r.text).toContain('Nenhum.');
    expect(r.text).not.toContain('Recebido');
    expect(r.text).not.toContain('(limite)');
  });

  it('escapa o HTML (nomes vindos dos leads)', () => {
    const r = buildWeeklyReport({ ...base, sites: { down: [{ name: '<b>X</b>', checks: 1 }], slow: [] } });
    expect(r.html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});
