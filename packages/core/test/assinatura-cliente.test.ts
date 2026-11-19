import { describe, expect, it } from 'vitest';
import {
  clientSignatureFile,
  clientSignatureHtml,
  clientSignatureText,
  signaturePhoneHref,
  signatureSiteHref,
  signatureSiteLabel,
} from '../src/client-signature';

const base = {
  name: 'Ana Ribeiro',
  role: 'Gerente',
  company: 'Padaria Sol',
  email: 'ana@padariasol.pt',
  phone: '912 345 678',
  website: 'padariasol.pt',
  address: 'Rua das Flores, 10, Braga',
  color: '#ef5c32',
};

describe('assinatura do cliente', () => {
  const html = clientSignatureHtml(base);

  it('leva os dados todos e a cor da marca', () => {
    expect(html).toContain('Ana Ribeiro');
    expect(html).toContain('Padaria Sol');
    expect(html).toContain('mailto:ana@padariasol.pt');
    expect(html).toContain('tel:+351912345678');
    expect(html).toContain('https://padariasol.pt');
    expect(html).toContain('#ef5c32');
  });

  it('usa tabelas e estilos em linha (é o que os emails percebem)', () => {
    expect(html.startsWith('<table')).toBe(true);
    expect(html).not.toContain('<style');
    expect(html).not.toContain('class=');
  });

  it('escapa o que o utilizador escreve', () => {
    const risky = clientSignatureHtml({ ...base, name: 'Ana <script>alert(1)</script>' });
    expect(risky).not.toContain('<script>');
    expect(risky).toContain('&lt;script&gt;');
  });

  it('sem logótipo não inventa imagem; com logótipo mostra-o', () => {
    expect(html).not.toContain('<img');
    const withLogo = clientSignatureHtml({ ...base, logo: { src: 'data:image/png;base64,AAA', width: 140 } });
    expect(withLogo).toContain('<img');
    expect(withLogo).toContain('width="140"');
  });

  it('o logótipo por cima fica noutra linha', () => {
    const abaixo = clientSignatureHtml({ ...base, logo: { src: 'data:image/png;base64,AAA', width: 100 }, layout: 'baixo' });
    expect(abaixo).toContain('border-top:2px solid #ef5c32');
  });

  it('cor inválida não entra no HTML', () => {
    expect(clientSignatureHtml({ ...base, color: 'javascript:alert(1)' })).toContain('#141414');
  });
});

describe('versão em texto e ficheiro', () => {
  it('o texto tem uma linha por dado', () => {
    expect(clientSignatureText(base).split('\n')).toEqual([
      'Ana Ribeiro',
      'Gerente · Padaria Sol',
      '912 345 678',
      'ana@padariasol.pt',
      'padariasol.pt',
      'Rua das Flores, 10, Braga',
    ]);
  });

  it('o ficheiro é uma página completa', () => {
    const file = clientSignatureFile(base);
    expect(file.startsWith('<!doctype html>')).toBe(true);
    expect(file).toContain('Ana Ribeiro');
  });
});

describe('endereços', () => {
  it('mostra sem https e abre com https', () => {
    expect(signatureSiteLabel('https://www.padaria.pt/')).toBe('www.padaria.pt');
    expect(signatureSiteHref('padaria.pt')).toBe('https://padaria.pt');
    expect(signatureSiteHref('http://padaria.pt')).toBe('http://padaria.pt');
  });

  it('telefone com indicativo internacional', () => {
    expect(signaturePhoneHref('+351 912 345 678')).toBe('tel:+351912345678');
    expect(signaturePhoneHref('00351912345678')).toBe('tel:+351912345678');
  });
});
