import { describe, expect, it } from 'vitest';
import { LeadGenerationScheduleUpsertSchema, cleanAiText, describeWeeklyRun, nextWeeklyRun } from '../src/lead-generation';

describe('nextWeeklyRun (hora de Lisboa)', () => {
  // Terça, 20/10/2026, 11:00 em Lisboa (WEST, UTC+1).
  const from = new Date('2026-10-20T10:00:00Z');

  it('segunda às 08:00 → depois da mudança para a hora de inverno (UTC+0)', () => {
    expect(nextWeeklyRun(1, 8, from).toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('hoje, mais tarde', () => {
    expect(nextWeeklyRun(2, 12, from).toISOString()).toBe('2026-10-20T11:00:00.000Z');
  });

  it('hoje, mas a hora já passou → semana seguinte', () => {
    expect(nextWeeklyRun(2, 9, from).toISOString()).toBe('2026-10-27T09:00:00.000Z');
  });

  it('exatamente à hora → semana seguinte (nunca repete)', () => {
    expect(nextWeeklyRun(2, 11, from).toISOString()).toBe('2026-10-27T11:00:00.000Z');
  });

  it('no próprio dia da mudança de hora', () => {
    expect(nextWeeklyRun(7, 8, from).toISOString()).toBe('2026-10-25T08:00:00.000Z');
  });

  it('hora de verão (março)', () => {
    expect(nextWeeklyRun(1, 8, new Date('2027-03-30T12:00:00Z')).toISOString()).toBe('2027-04-05T07:00:00.000Z');
  });
});

describe('pesquisas automáticas', () => {
  it('valores por omissão: segunda às 08:00, rever antes de adicionar', () => {
    const v = LeadGenerationScheduleUpsertSchema.parse({ query: 'restaurantes sem site' });
    expect(v).toMatchObject({ enabled: true, weekday: 1, hour: 8, auto_add: false, audit: true, max_results: 15, city: null, services: [] });
  });

  it('descreve o horário', () => {
    expect(describeWeeklyRun(1, 8)).toBe('Segunda-feira às 08:00');
  });
});

describe('cleanAiText', () => {
  it('tira as citações em Markdown do fornecedor', () => {
    expect(
      cleanAiText(
        'O site apresenta instruções do modelo por preencher. O portefólio mantém texto genérico. ([rodrijor.pt](https://www.rodrijor.pt/?utm_source=openai))',
      ),
    ).toBe('O site apresenta instruções do modelo por preencher. O portefólio mantém texto genérico.');
    expect(cleanAiText('Ver [o site](https://exemplo.pt) e ([a](https://a.pt), [b](https://b.pt)).')).toBe('Ver o site e.');
    expect(cleanAiText('Sem site próprio, só Facebook.')).toBe('Sem site próprio, só Facebook.');
    expect(cleanAiText(null)).toBeNull();
  });
});
