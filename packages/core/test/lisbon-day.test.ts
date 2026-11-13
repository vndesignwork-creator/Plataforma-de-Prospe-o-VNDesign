import { describe, expect, it } from 'vitest';
import { lisbonDayStart } from '../src/format';

describe('lisbonDayStart', () => {
  it('inverno: meia-noite de Lisboa = meia-noite UTC', () => {
    expect(lisbonDayStart(new Date('2026-11-13T10:00:00Z'))).toBe('2026-11-13T00:00:00.000Z');
  });
  it('verão: meia-noite de Lisboa = 23:00 UTC da véspera', () => {
    expect(lisbonDayStart(new Date('2026-07-10T10:00:00Z'))).toBe('2026-07-09T23:00:00.000Z');
    // 23:30 UTC já é dia 11 em Lisboa.
    expect(lisbonDayStart(new Date('2026-07-10T23:30:00Z'))).toBe('2026-07-10T23:00:00.000Z');
  });
});
