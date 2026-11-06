import { describe, expect, it } from 'vitest';
import { FreeAuditSubmitSchema, freeAuditLayoutFrom, freeAuditPageUrl, freeAuditSnippets } from '../src/free-audit';

const base = { email: 'dono@padaria.pt', consent: true };

describe('pedido da análise grátis', () => {
  it('aceita o site sem https e junta-o', () => {
    const r = FreeAuditSubmitSchema.parse({ ...base, website: 'www.padaria.pt' });
    expect(r.website).toBe('https://www.padaria.pt');
  });

  it('um site inválido dá a mensagem, sem rebentar', () => {
    for (const website of ['isto não é um site', 'padaria', 'http://', 'https://padaria.1']) {
      const r = FreeAuditSubmitSchema.safeParse({ ...base, website });
      expect(r.success, website).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/Endereço inválido|Escreva o endereço/);
    }
  });

  it('pede o consentimento', () => {
    const r = FreeAuditSubmitSchema.safeParse({ email: 'a@b.pt', website: 'padaria.pt', consent: false });
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['consent']);
  });
});

describe('aspeto da página e HTML sem plugin', () => {
  const url = 'https://leads.vndesign.pt/analise/abcdefghijklmnop1234';

  it('o endereço leva as escolhas e lê-as de volta', () => {
    expect(freeAuditPageUrl(url)).toBe(url);
    expect(freeAuditPageUrl(url, { promo: true, side: 'left' })).toBe(`${url}?lado=esquerda`);
    expect(freeAuditPageUrl(url, { promo: false, side: 'left' }, true)).toBe(`${url}?embed=1&texto=0`);
    expect(freeAuditLayoutFrom({ lado: 'esquerda' })).toEqual({ promo: true, side: 'left' });
    expect(freeAuditLayoutFrom({ texto: '0' })).toEqual({ promo: false, side: 'right' });
  });

  it('a moldura ocupa a largura toda e só aceita a altura vinda da plataforma', () => {
    const { iframe, button } = freeAuditSnippets(url, { promo: true, side: 'left' });
    expect(iframe).toContain(`src="${url}?embed=1&lado=esquerda"`);
    expect(iframe).toContain('width:100%');
    expect(iframe).not.toContain('max-width');
    expect(iframe).toContain('e.origin==="https://leads.vndesign.pt"');
    expect(button).toContain(`href="${url}?lado=esquerda"`);
  });
});
