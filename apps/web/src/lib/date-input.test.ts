import { describe, expect, it } from 'vitest';
import {
  formatDateText,
  formatDateTimeText,
  monthGrid,
  parseDateText,
  parseDateTimeText,
  parseTimeText,
  shiftMonths,
} from './date-input';

describe('datas escritas à mão', () => {
  it('aceita DD/MM/AAAA, variantes e o formato ISO', () => {
    expect(parseDateText('15/10/2026')).toBe('2026-10-15');
    expect(parseDateText('5-1-26')).toBe('2026-01-05');
    expect(parseDateText('15.10.2026')).toBe('2026-10-15');
    expect(parseDateText('2026-10-15')).toBe('2026-10-15');
    expect(parseDateText('31/02/2026')).toBeNull();
    expect(parseDateText('15/10')).toBeNull();
    expect(formatDateText('2026-10-05')).toBe('05/10/2026');
  });

  it('horas e data com hora (lembretes)', () => {
    expect(parseTimeText('9h30')).toBe('09:30');
    expect(parseTimeText('0930')).toBe('09:30');
    expect(parseTimeText('25:00')).toBeNull();
    expect(parseDateTimeText('15/10/2026 10:30')).toBe('2026-10-15T10:30');
    expect(parseDateTimeText('15/10/2026 às 9h')).toBe('2026-10-15T09:00');
    expect(parseDateTimeText('15/10/2026')).toBe('2026-10-15T09:00');
    expect(parseDateTimeText('2026-10-15T10:30')).toBe('2026-10-15T10:30');
    expect(parseDateTimeText('15/10/2026 99:00')).toBeNull();
    expect(formatDateTimeText('2026-10-15T10:30')).toBe('15/10/2026 10:30');
  });

  it('grelha do mês a começar à segunda e meses sem o dia 31', () => {
    const grid = monthGrid('2026-10-15');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28'); // 1 de outubro de 2026 é quinta
    expect(grid[3]).toBe('2026-10-01');
    expect(shiftMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});
