import { describe, expect, it } from 'vitest';
import { isQuietTime, parseQuietHours } from '../src';

describe('horário de silêncio', () => {
  const quiet = parseQuietHours({ enabled: true, from: '21:00', to: '08:00' });

  it('passa a meia-noite (hora de Lisboa)', () => {
    // 25/10/2026 já é hora de inverno (UTC+0); 20/10 ainda é de verão (UTC+1).
    expect(isQuietTime(quiet, new Date('2026-10-20T20:30:00Z'))).toBe(true); // 21:30
    expect(isQuietTime(quiet, new Date('2026-10-20T19:30:00Z'))).toBe(false); // 20:30
    expect(isQuietTime(quiet, new Date('2026-10-21T06:59:00Z'))).toBe(true); // 07:59
    expect(isQuietTime(quiet, new Date('2026-10-21T07:00:00Z'))).toBe(false); // 08:00
    expect(isQuietTime(quiet, new Date('2026-11-03T07:30:00Z'))).toBe(true); // 07:30 (inverno)
  });

  it('janela no mesmo dia, fins de semana e desligado', () => {
    const lunch = parseQuietHours({ enabled: true, from: '13:00', to: '14:00', weekends: true });
    expect(isQuietTime(lunch, new Date('2026-11-03T13:30:00Z'))).toBe(true);
    expect(isQuietTime(lunch, new Date('2026-11-03T14:00:00Z'))).toBe(false);
    expect(isQuietTime(lunch, new Date('2026-11-07T10:00:00Z'))).toBe(true); // sábado
    expect(isQuietTime({ ...lunch, enabled: false }, new Date('2026-11-07T10:00:00Z'))).toBe(false);
    expect(isQuietTime(parseQuietHours({ enabled: true, from: '09:00', to: '09:00' }), new Date('2026-11-03T09:00:00Z'))).toBe(false);
  });

  it('valor guardado inválido ou vazio = desligado', () => {
    expect(parseQuietHours(null).enabled).toBe(false);
    expect(parseQuietHours({ enabled: true, from: '25:00' }).enabled).toBe(false);
  });
});
