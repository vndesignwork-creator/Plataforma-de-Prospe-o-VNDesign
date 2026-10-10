import { describe, expect, it } from 'vitest';
import { isoToLocalInput, localInputToIso } from './local-datetime';

describe('datetime-local ↔ ISO', () => {
  it('ida e volta mantém o instante', () => {
    const iso = '2026-10-15T09:30:00.000Z';
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });
  it('vazio e inválido', () => {
    expect(isoToLocalInput(null)).toBe('');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('não é data')).toBeNull();
  });
});
