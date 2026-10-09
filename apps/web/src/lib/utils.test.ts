import { describe, expect, it } from 'vitest';
import { safeNextPath } from './utils';

describe('safeNextPath', () => {
  it('aceita caminhos internos (com pesquisa e âncora)', () => {
    expect(safeNextPath('/leads?estado=contactado')).toBe('/leads?estado=contactado');
    expect(safeNextPath('/definicoes#conta')).toBe('/definicoes#conta');
  });

  it('recusa endereços que levariam a outro site', () => {
    for (const next of ['//mal.pt', '/\\mal.pt', '/\t/mal.pt', 'https://mal.pt', 'mal.pt', '', null, undefined]) {
      expect(safeNextPath(next)).toBe('/dashboard');
    }
  });
});
