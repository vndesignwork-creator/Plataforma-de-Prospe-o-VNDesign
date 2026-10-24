import { describe, expect, it } from 'vitest';
import { agendaSummary, isWeekend, spreadFollowUps, workingDay, type CalendarEvent } from '../src';

describe('dias úteis', () => {
  it('sábado e domingo passam para segunda (a não ser que se trabalhe ao fim de semana)', () => {
    expect(workingDay('2026-10-24')).toBe('2026-10-26'); // sábado
    expect(workingDay('2026-10-25')).toBe('2026-10-26'); // domingo
    expect(workingDay('2026-10-23')).toBe('2026-10-23'); // sexta
    expect(workingDay('2026-10-25', true)).toBe('2026-10-25');
    expect(isWeekend('2026-10-24')).toBe(true);
    expect(isWeekend('2026-10-26')).toBe(false);
  });
});

describe('distribuir pela semana', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);

  it('os que passam do limite vão para os dias úteis seguintes com lugar', () => {
    // Quinta 22/10 com 12; sexta já tem 7: leva 1, o resto vai para segunda (salta o fim de semana).
    const moves = spreadFollowUps(ids, '2026-10-22', { '2026-10-22': 12, '2026-10-23': 7 }, { limit: 8 });
    expect(moves).toEqual([
      { id: 'l9', date: '2026-10-23' },
      { id: 'l10', date: '2026-10-26' },
      { id: 'l11', date: '2026-10-26' },
      { id: 'l12', date: '2026-10-26' },
    ]);
  });

  it('a trabalhar ao fim de semana usa o sábado', () => {
    const moves = spreadFollowUps(ids.slice(0, 10), '2026-10-23', { '2026-10-23': 10 }, { limit: 8, workWeekends: true });
    expect(moves.map((m) => m.date)).toEqual(['2026-10-24', '2026-10-24']);
  });

  it('dentro do limite não muda nada', () => {
    expect(spreadFollowUps(ids.slice(0, 5), '2026-10-22', { '2026-10-22': 5 })).toEqual([]);
  });
});

describe('resumo da semana', () => {
  const ev = (type: CalendarEvent['type'], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: `${type}-${Math.random()}`,
    date: '2026-10-26',
    type,
    title: type,
    starts_at: null,
    amount: null,
    done: false,
    lead: { id: '00000000-0000-4000-8000-000000000001', number: 1, company_name: 'X' },
    ...extra,
  });
  it('conta reuniões, entregas, tarefas por fazer, follow-ups e o valor por receber', () => {
    expect(
      agendaSummary([
        ev('meeting'),
        ev('due'),
        ev('payment', { amount: 500 }),
        ev('payment', { amount: 300, done: true }),
        ev('task'),
        ev('task', { done: true }),
        ev('followup'),
        ev('followup'),
      ]),
    ).toEqual({ meetings: 1, dues: 1, receivable: 500, tasks: 1, followups: 2 });
  });
});
