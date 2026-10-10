import { describe, expect, it } from 'vitest';
import { safeNextPath, telUrl, whatsappUrl } from './utils';

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

describe('whatsappUrl', () => {
  it('aceita telemóveis portugueses com ou sem indicativo', () => {
    expect(whatsappUrl('912 345 678')).toBe('https://wa.me/351912345678');
    expect(whatsappUrl('+351 912 345 678')).toBe('https://wa.me/351912345678');
    expect(whatsappUrl('00351912345678')).toBe('https://wa.me/351912345678');
    expect(whatsappUrl('351912345678')).toBe('https://wa.me/351912345678');
  });
  it('recusa fixos portugueses e números sem indicativo de outros países', () => {
    expect(whatsappUrl('21 625 0897')).toBeNull();
    expect(whatsappUrl('+351 21 625 0897')).toBeNull();
    expect(whatsappUrl('11 98765 4321')).toBeNull();
    expect(whatsappUrl('')).toBeNull();
    expect(whatsappUrl(null)).toBeNull();
  });
  it('aceita outros países com indicativo', () => {
    expect(whatsappUrl('+55 11 98765-4321')).toBe('https://wa.me/5511987654321');
    expect(whatsappUrl('+44 7700 900123')).toBe('https://wa.me/447700900123');
  });
});

describe('telUrl', () => {
  it('tira espaços e mantém o +', () => {
    expect(telUrl('21 625 0897')).toBe('tel:216250897');
    expect(telUrl('+351 912-345-678')).toBe('tel:+351912345678');
  });
});
