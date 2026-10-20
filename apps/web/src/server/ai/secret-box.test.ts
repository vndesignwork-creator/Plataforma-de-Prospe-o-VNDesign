import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keyHint, openSecret, sealSecret } from './secret-box';

describe('cifra das chaves de IA', () => {
  const saved = process.env.AI_KEYS_SECRET;
  beforeEach(() => {
    process.env.AI_KEYS_SECRET = 'segredo-de-teste-1234567890';
  });
  afterEach(() => {
    process.env.AI_KEYS_SECRET = saved;
  });

  it('cifra e decifra; cada cifra é diferente', () => {
    const a = sealSecret('sk-teste-abcdef1234');
    const b = sealSecret('sk-teste-abcdef1234');
    expect(a).not.toBe(b);
    expect(a).not.toContain('sk-teste');
    expect(openSecret(a)).toBe('sk-teste-abcdef1234');
  });

  it('não abre com outro segredo nem adulterada', () => {
    const sealed = sealSecret('sk-teste-abcdef1234');
    expect(openSecret(sealed.slice(0, -2) + 'AA')).toBeNull();
    process.env.AI_KEYS_SECRET = 'outro-segredo-0987654321';
    expect(openSecret(sealed)).toBeNull();
  });

  it('mostra só os últimos carateres', () => {
    expect(keyHint('sk-or-v1-123456789abcd')).toBe('…abcd');
  });
});
