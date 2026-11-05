import { expect, it } from 'vitest';
import { callWindowLabel, currentAvoidWindow } from '../src/call-windows';

it('horas a evitar: o intervalo em que estamos agora (hora de Lisboa)', () => {
  const lunch = { from: '12:00', to: '15:00' };
  const night = { from: '22:00', to: '08:00' };
  // Inverno: Lisboa = UTC.
  expect(currentAvoidWindow([lunch], new Date('2026-11-05T13:30:00Z'))).toEqual(lunch);
  expect(currentAvoidWindow([lunch], new Date('2026-11-05T15:00:00Z'))).toBeNull();
  expect(currentAvoidWindow([night], new Date('2026-11-05T06:00:00Z'))).toEqual(night);
  // Verão: Lisboa = UTC+1 → 11:30 UTC são 12:30 em Lisboa.
  expect(currentAvoidWindow([lunch], new Date('2026-07-01T11:30:00Z'))).toEqual(lunch);
  expect(callWindowLabel({ from: '19:00', to: '22:30' })).toBe('19h–22h30');
});
