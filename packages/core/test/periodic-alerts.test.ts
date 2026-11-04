import { describe, expect, it } from 'vitest';
import { coolingAlert, describeNotification, lisbonDayOfMonth, lisbonWeekday, monthlyUpdateAlert } from '../src';

describe('avisos periódicos', () => {
  it('dia da semana e do mês em Lisboa', () => {
    // 2026-11-02 é segunda-feira.
    expect(lisbonWeekday(new Date('2026-11-02T10:00:00Z'))).toBe(1);
    expect(lisbonWeekday(new Date('2026-11-01T10:00:00Z'))).toBe(7);
    // Verão (UTC+1): 23:30 UTC de 31 de julho já é 1 de agosto em Lisboa.
    expect(lisbonDayOfMonth(new Date('2026-07-31T23:30:00Z'))).toBe(1);
  });
  it('textos', () => {
    expect(coolingAlert(5, ['A', 'B', 'C', 'D', 'E'])).toMatchObject({ title: '🧊 5 leads a arrefecer', body: 'Em conversa e sem novidades há mais de 14 dias: A, B, C e mais 2.' });
    expect(coolingAlert(2, ['A', 'B']).body).toContain('A e B.');
    expect(coolingAlert(1, ['A']).url).toBe('/leads?status=respondeu,reuniao,proposta_enviada&parado=14');
    expect(monthlyUpdateAlert(1, ['Atelier'], new Date('2026-12-01T09:00:00Z')).title).toBe('📨 Ponto de situação de dezembro');
  });
  it('no sino', () => {
    const v = describeNotification({ kind: 'daily', title: '🧊 3 leads a arrefecer', text: 'Em conversa…', task_id: null, lead: null }, null);
    expect(v).toMatchObject({ label: 'A arrefecer', tone: 'info', title: '3 leads a arrefecer' });
    expect(describeNotification({ kind: 'client', title: '📨 Ponto de situação de dezembro', text: 'x', task_id: null, lead: null }, null).label).toBe('Ponto de situação');
  });
});
