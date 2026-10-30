import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatCurrency, formatDate, formatDateTime, relativeDay, todayIso, workingDay } from '../src/format';

describe('formatação pt-PT', () => {
  it('datas DD/MM/AAAA', () => {
    expect(formatDate('2026-10-08')).toBe('08/10/2026');
    expect(formatDate(null)).toBe('');
    // 23:30 UTC de 31/12 já é 01/01 em... não: Lisboa no inverno = UTC
    expect(formatDate('2026-07-31T23:30:00Z')).toBe('01/08/2026'); // verão: UTC+1
  });
  it('data e hora em Lisboa', () => {
    expect(formatDateTime('2026-10-08T13:05:00Z')).toBe('08/10/2026, 14:05');
  });
  it('euros', () => {
    expect(formatCurrency(1250.5).replace(/\s/g, ' ')).toBe('1250,50 €');
    expect(formatCurrency(null)).toBe('');
  });
  it('aritmética de datas', () => {
    expect(addDays('2026-10-08', 3)).toBe('2026-10-11');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-10-08', '2026-10-11')).toBe(3);
    expect(todayIso(new Date('2026-10-08T23:30:00Z'))).toBe('2026-10-09');
  });
});

describe('dias úteis', () => {
  it('sábado e domingo passam para segunda (a não ser que se trabalhe ao fim de semana)', () => {
    expect(workingDay('2026-10-24')).toBe('2026-10-26'); // sábado
    expect(workingDay('2026-10-25')).toBe('2026-10-26'); // domingo
    expect(workingDay('2026-10-23')).toBe('2026-10-23'); // sexta
    expect(workingDay('2026-10-25', true)).toBe('2026-10-25');
  });
});

describe('relativeDay', () => {
  it('diz o dia em relação a hoje', () => {
    expect(relativeDay('2026-10-30', '2026-10-30')).toBe('hoje');
    expect(relativeDay('2026-10-31', '2026-10-30')).toBe('amanhã');
    expect(relativeDay('2026-10-29', '2026-10-30')).toBe('ontem');
    expect(relativeDay('2026-10-26', '2026-10-30')).toBe('há 4 dias');
    expect(relativeDay('2026-11-02', '2026-10-30')).toBe('daqui a 3 dias');
    // Mudança de hora (25/10/2026): continua a contar dias de calendário.
    expect(relativeDay('2026-10-24', '2026-10-26')).toBe('há 2 dias');
  });
});
