import { describe, expect, it } from 'vitest';
import {
  addEmailTracking,
  buildLaunchChecklist,
  cityFromAddress,
  describeUserAgent,
  evaluateLaunch,
  formatSharedPhone,
  nameFromSocialText,
  pageContacts,
  pageSpeedScreenshot,
  parseMapsPlaceUrl,
  prettifyHandle,
  shareLinkKind,
  socialHandle,
  splitShared,
  timeAgo,
} from '../src';

describe('partilhar para a app', () => {
  it('reconhece o tipo de link', () => {
    expect(shareLinkKind('https://maps.app.goo.gl/AbC123')).toBe('maps');
    expect(shareLinkKind('https://www.google.pt/maps/place/Padaria')).toBe('maps');
    expect(shareLinkKind('https://www.instagram.com/padaria.sol?igsh=1')).toBe('instagram');
    expect(shareLinkKind('https://m.facebook.com/padariasol')).toBe('facebook');
    expect(shareLinkKind('https://padariasol.pt/')).toBe('website');
    expect(shareLinkKind('https://wa.me/351912345678')).toBeNull();
  });

  it('separa links e linhas do texto partilhado pelo Maps', () => {
    const { urls, lines } = splitShared({ title: '', text: 'Padaria Sol\nRua Direita 12, 1000-001 Lisboa\nhttps://maps.app.goo.gl/xyz', url: '' });
    expect(urls).toEqual(['https://maps.app.goo.gl/xyz']);
    expect(lines).toEqual(['Padaria Sol', 'Rua Direita 12, 1000-001 Lisboa']);
  });

  it('lê o nome e as coordenadas do link longo do Maps (também atrás do consentimento)', () => {
    const long = 'https://www.google.com/maps/place/Padaria+S%C3%B3l/@38.7071,-9.1355,17z/data=!3d38.70712!4d-9.13561';
    expect(parseMapsPlaceUrl(long)).toEqual({ name: 'Padaria Sól', lat: 38.70712, lng: -9.13561 });
    const consent = `https://consent.google.com/m?continue=${encodeURIComponent(long)}`;
    expect(parseMapsPlaceUrl(consent).name).toBe('Padaria Sól');
  });

  it('cidade, perfis e nomes', () => {
    expect(cityFromAddress('Rua Direita 12, 1000-001 Lisboa')).toBe('Lisboa');
    expect(cityFromAddress('Av. Central 3, 4700-001 Braga, Portugal')).toBe('Braga');
    expect(cityFromAddress('Sem código postal')).toBeNull();
    expect(socialHandle('https://www.instagram.com/padaria.sol/')).toBe('padaria.sol');
    expect(socialHandle('https://www.instagram.com/p/Cx1/')).toBeNull();
    expect(prettifyHandle('padaria.sol_lisboa')).toBe('Padaria Sol Lisboa');
    expect(nameFromSocialText(['Veja o perfil de Padaria Sol (@padariasol) no Instagram'])).toBe('Padaria Sol');
    expect(formatSharedPhone('+351912345678')).toBe('+351 912 345 678');
  });

  it('título, telefone e email do site', () => {
    const html = '<title>Padaria Sol | Pão quente</title><a href="tel:+351 212 345 678">Ligar</a> geral@padariasol.pt <img src="logo@2x.png">';
    expect(pageContacts(html)).toEqual({ title: 'Padaria Sol', phones: ['+351212345678'], emails: ['geral@padariasol.pt'] });
  });
});

describe('checklist de lançamento', () => {
  const html = `<html><head><title>Cliente</title><meta name="description" content="Desc">
    <meta name="viewport" content="width=device-width, initial-scale=1"><meta property="og:image" content="/og.jpg">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></head><body><a href="/privacidade">Privacidade</a></body></html>`;

  it('avalia os pontos automáticos', () => {
    const r = evaluateLaunch({ https: true, sslValid: true, redirectsToHttps: true, html, faviconFound: true, notFoundStatus: 404, sitemapFound: true, robots: 'User-agent: *\nDisallow: /wp-admin/', pagespeed: 85 });
    for (const key of ['https', 'redirect_https', 'mobile', 'seo', 'favicon', 'og_image', 'not_found', 'sitemap', 'robots', 'analytics', 'privacy', 'speed'] as const) {
      expect(r[key]?.ok, key).toBe(true);
    }
  });

  it('aponta o que falta', () => {
    const r = evaluateLaunch({ https: false, sslValid: null, redirectsToHttps: false, html: '<meta name="robots" content="noindex">', faviconFound: false, notFoundStatus: 200, sitemapFound: false, robots: null, pagespeed: 40 });
    expect(r.https).toEqual({ ok: false, detail: 'O site abre sem HTTPS.' });
    expect(r.not_found?.detail).toContain('200 em vez de 404');
    expect(r.robots?.detail).toContain('noindex');
    expect(r.speed).toEqual({ ok: false, detail: 'PageSpeed no telemóvel: 40.' });
    const blocked = evaluateLaunch({ https: true, sslValid: true, redirectsToHttps: true, html, faviconFound: true, notFoundStatus: 404, sitemapFound: true, robots: 'User-agent: *\nDisallow: /', pagespeed: null });
    expect(blocked.robots?.ok).toBe(false);
    expect(blocked.speed).toBeUndefined();
  });

  it('monta a lista com os pontos guardados', () => {
    const list = buildLaunchChecklist({ https: { done: true, auto: true, detail: null, at: 'x' } }, 'https://cliente.pt', null);
    expect(list.total).toBe(19);
    expect(list.done).toBe(1);
    expect(list.checks.form_tested).toEqual({ done: false, auto: null, detail: null, at: null });
  });
});

describe('email, imagens e conta', () => {
  it('troca os links pela plataforma e junta a imagem de 1×1', () => {
    const { html, links } = addEmailTracking('<p><a href="https://a.pt/?x=1&amp;y=2">a</a> <a href="https://b.pt">b</a> <a href="https://a.pt/?x=1&amp;y=2">a</a></p>', 'https://app/t/TOKEN');
    expect(links).toEqual(['https://a.pt/?x=1&y=2', 'https://b.pt']);
    expect(html).toContain('href="https://app/t/TOKEN/0"');
    expect(html).toContain('href="https://app/t/TOKEN/1"');
    expect(html).toContain('<img src="https://app/t/TOKEN/o.gif"');
  });

  it('imagem do PageSpeed', () => {
    const json = { lighthouseResult: { audits: { 'final-screenshot': { details: { data: 'data:image/jpeg;base64,AAA', width: 412, height: 823 } } } } };
    expect(pageSpeedScreenshot(json)).toEqual({ data: 'data:image/jpeg;base64,AAA', width: 412, height: 823 });
    expect(pageSpeedScreenshot({})).toBeNull();
  });

  it('aparelho da sessão e "há quanto tempo"', () => {
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari no iPhone');
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')).toBe('Chrome no Android');
    expect(describeUserAgent(null)).toBe('Aparelho desconhecido');
    const now = new Date('2026-10-22T12:00:00Z');
    expect(timeAgo('2026-10-22T11:55:00Z', now)).toBe('há 5 min');
    expect(timeAgo('2026-10-22T09:00:00Z', now)).toBe('há 3 h');
    expect(timeAgo('2026-10-21T12:00:00Z', now)).toBe('há 1 dia');
  });
});
