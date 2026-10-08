import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatCurrency, formatDate, formatDateTime, todayIso } from '../src/format';

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
