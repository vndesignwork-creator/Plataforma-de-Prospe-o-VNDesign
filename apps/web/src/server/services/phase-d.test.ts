import type { Lead, Today } from '@vndesign/core';
import { describe, expect, it } from 'vitest';
import { appendProblems } from './audits';
import { buildDailyPush } from './push';

const lead = (id: string, company_name: string) => ({ id, company_name }) as Lead;
const today = (overdue: Lead[], due_today: Lead[]): Today => ({ today: '2026-10-09', overdue, due_today, upcoming: [] });

describe('appendProblems', () => {
  it('junta sem repetir (ignora maiúsculas)', () => {
    expect(appendProblems('Sem HTTPS; site lento', 'sem https; Não é responsivo')).toBe('Sem HTTPS; site lento; Não é responsivo');
    expect(appendProblems(null, 'Sem HTTPS')).toBe('Sem HTTPS');
    expect(appendProblems('Linha 1\nLinha 2', 'Linha 2')).toBe('Linha 1; Linha 2');
  });
});

describe('buildDailyPush', () => {
  it('nada para hoje → sem notificação', () => {
    expect(buildDailyPush(today([], []))).toBeNull();
  });

  it('um só follow-up abre o lead', () => {
    expect(buildDailyPush(today([], [lead('a', 'Clínica Sá')]))).toEqual({
      title: '1 follow-up à tua espera',
      body: '1 para hoje — Clínica Sá',
      url: '/leads/a',
      tag: 'daily-follow-ups',
    });
  });

  it('vários abrem o dashboard e resumem os nomes', () => {
    const p = buildDailyPush(today([lead('a', 'A'), lead('b', 'B')], [lead('c', 'C'), lead('d', 'D')]))!;
    expect(p.title).toBe('4 follow-ups à tua espera');
    expect(p.body).toBe('2 em atraso · 2 para hoje — A, B, C…');
    expect(p.url).toBe('/dashboard');
  });
});
