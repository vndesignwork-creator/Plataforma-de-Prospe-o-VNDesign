import { describe, expect, it } from 'vitest';
import { copyTitle } from '../src/proposals';

describe('título da cópia de uma proposta', () => {
  it('acrescenta "(cópia)"', () => {
    expect(copyTitle('Proposta de website — Padaria Sol')).toBe('Proposta de website — Padaria Sol (cópia)');
  });

  it('numera quando já existe uma cópia', () => {
    const existing = ['Site novo', 'Site novo (cópia)'];
    expect(copyTitle('Site novo', existing)).toBe('Site novo (cópia 2)');
    expect(copyTitle('Site novo', [...existing, 'Site novo (cópia 2)'])).toBe('Site novo (cópia 3)');
  });

  it('não empilha "(cópia) (cópia)": parte sempre do título original', () => {
    expect(copyTitle('Site novo (cópia)', ['Site novo (cópia)'])).toBe('Site novo (cópia 2)');
    expect(copyTitle('Site novo (cópia 3)', [])).toBe('Site novo (cópia)');
  });

  it('aguenta um título só com espaços à volta', () => {
    expect(copyTitle('  Loja online  ')).toBe('Loja online (cópia)');
  });
});
