import { describe, expect, it } from 'vitest';
import { clientColor } from '../src';

describe('cor do cliente', () => {
  it('o mesmo cliente dá sempre a mesma cor', () => {
    expect(clientColor('O Quintal')).toBe(clientColor('o quintal '));
  });

  it('clientes diferentes costumam dar cores diferentes', () => {
    const nomes = ['O Quintal', 'Glow e Aromaa', 'Associação Salvador', 'VNDesign', 'LMFL'];
    expect(new Set(nomes.map((n) => clientColor(n))).size).toBeGreaterThan(3);
  });

  it('sem nome não inventa cor', () => {
    expect(clientColor('')).toBeNull();
    expect(clientColor(null)).toBeNull();
    expect(clientColor(undefined)).toBeNull();
  });

  it('nunca usa o laranja da marca', () => {
    for (const n of ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff', 'g', 'hh', 'iii', 'jjjj', 'kkkkk', 'llllll']) {
      const hue = Number(/hsl\((\d+)/.exec(clientColor(n)!)![1]);
      expect(hue < 5 || hue > 35).toBe(true);
    }
  });
});
