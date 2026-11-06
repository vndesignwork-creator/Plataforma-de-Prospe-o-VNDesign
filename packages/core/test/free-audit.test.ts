import { describe, expect, it } from 'vitest';
import { FreeAuditSubmitSchema, freeAuditFollowUpEmail, freeAuditLayoutFrom, freeAuditPageUrl, freeAuditSnippets, freeAuditSourceKey, freeAuditSourceLabel, freeAuditSummary } from '../src/free-audit';

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
    expect(freeAuditPageUrl(url, { promo: true, side: 'left' })).toBe(url);
    expect(freeAuditPageUrl(url, { promo: true, side: 'right' })).toBe(`${url}?lado=direita`);
    expect(freeAuditPageUrl(url, { promo: false, side: 'left' }, true)).toBe(`${url}?embed=1&texto=0`);
    expect(freeAuditLayoutFrom({})).toEqual({ promo: true, side: 'left' });
    expect(freeAuditLayoutFrom({ lado: 'esquerda' })).toEqual({ promo: true, side: 'left' });
    expect(freeAuditLayoutFrom({ lado: 'direita' })).toEqual({ promo: true, side: 'right' });
    expect(freeAuditLayoutFrom({ texto: '0' })).toEqual({ promo: false, side: 'left' });
  });

  it('a moldura ocupa a largura toda e só aceita a altura vinda da plataforma', () => {
    const { iframe, button } = freeAuditSnippets(url, { promo: true, side: 'right' });
    expect(iframe).toContain(`src="${url}?embed=1&lado=direita"`);
    expect(iframe).toContain('width:100%');
    expect(iframe).not.toContain('max-width');
    expect(iframe).toContain('e.origin==="https://leads.vndesign.pt"');
    expect(button).toContain(`href="${url}?lado=direita"`);
  });
});

describe('resultado, origem e follow-up', () => {
  it('resume a análise para o ecrã (os 3 problemas mais graves primeiro)', () => {
    const s = freeAuditSummary({
      pagespeed_mobile: 38,
      has_viewport: true,
      zoom_blocked: false,
      suggested_mobile: null,
      https: false,
      ssl_valid: null,
      issues: [
        { code: 'no_meta_description', severity: 'medium', message: 'Sem meta descrição.', short: 'Sem meta' },
        { code: 'no_https', severity: 'high', message: 'Não usa HTTPS.', short: 'Sem HTTPS' },
        { code: 'slow_lcp', severity: 'medium', message: 'Demora 6 s.', short: 'Lento' },
        { code: 'copyright_old', severity: 'low', message: 'Ano antigo.', short: 'Ano' },
      ],
    } as never);
    expect(s.speed).toEqual({ score: 38, label: 'Lento', tone: 'bad' });
    expect(s.mobile.tone).toBe('good');
    expect(s.security).toEqual({ label: 'Aparece “Não seguro”', tone: 'bad' });
    expect(s.issues).toEqual(['Não usa HTTPS.', 'Sem meta descrição.', 'Demora 6 s.']);
  });

  it('diz de onde veio o pedido', () => {
    expect(freeAuditSourceLabel({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'primavera', page: 'https://vndesign.pt/servicos/' })).toBe('google / cpc · campanha primavera · na página vndesign.pt/servicos');
    expect(freeAuditSourceLabel({ page: 'https://vndesign.pt/', referrer: 'https://www.facebook.com/' })).toBe('na página vndesign.pt · vindo de www.facebook.com');
    expect(freeAuditSourceLabel(undefined)).toBeNull();
    expect(freeAuditSourceKey({ utm_source: 'Google', utm_medium: 'CPC' })).toBe('google / cpc');
    expect(freeAuditSourceKey({ page: 'https://vndesign.pt/', referrer: 'https://www.facebook.com/x' })).toBe('facebook.com');
    expect(freeAuditSourceKey({ page: 'https://vndesign.pt/a', referrer: 'https://vndesign.pt/' })).toBe('direto');
  });

  it('follow-up curto com o nome', () => {
    expect(freeAuditFollowUpEmail({ name: 'Marta Sousa', host: 'padaria.pt' }).body).toMatch(/^Olá Marta,[\s\S]*padaria\.pt/);
  });

  it('aceita a origem e o Turnstile no envio', () => {
    const r = FreeAuditSubmitSchema.parse({ ...base, website: 'padaria.pt', source: { page: 'https://x.pt/', utm_source: 'google' }, turnstile: 'tok' });
    expect(r.source).toEqual({ page: 'https://x.pt/', utm_source: 'google' });
    expect(r.turnstile).toBe('tok');
  });
});
