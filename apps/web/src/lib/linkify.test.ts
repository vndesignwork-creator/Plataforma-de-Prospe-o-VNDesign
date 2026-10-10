import { describe, expect, it } from 'vitest';
import { splitLinks } from './linkify';

const links = (text: string) => splitLinks(text).filter((p) => p.href).map((p) => [p.text, p.href]);

describe('splitLinks', () => {
  it('reconhece https, www e domínios com extensão', () => {
    expect(links('Ver https://oquintal.pt/menu?x=1 e www.casquinha.pt')).toEqual([
      ['https://oquintal.pt/menu?x=1', 'https://oquintal.pt/menu?x=1'],
      ['www.casquinha.pt', 'https://www.casquinha.pt'],
    ]);
    expect(links('Pedir acesso a oquintal.mdig.pt/admin')).toEqual([['oquintal.mdig.pt/admin', 'https://oquintal.mdig.pt/admin']]);
  });

  it('a pontuação do fim da frase não entra no link', () => {
    expect(links('Ver vndesign.pt.')).toEqual([['vndesign.pt', 'https://vndesign.pt']]);
    expect(links('(ver https://a.pt/x), depois')).toEqual([['https://a.pt/x', 'https://a.pt/x']]);
  });

  it('não confunde versões, emails nem texto normal', () => {
    expect(links('Versão 1.2 do logótipo, enviar a geral@oquintal.pt')).toEqual([]);
    expect(links('Reunião às 15h')).toEqual([]);
    expect(links('javascript:alert(1)')).toEqual([]);
  });

  it('mantém o texto completo', () => {
    const text = 'Enviar maquete: https://figma.com/abc, até sexta.';
    expect(splitLinks(text).map((p) => p.text).join('')).toBe(text);
  });
});
