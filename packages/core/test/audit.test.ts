import { describe, expect, it } from 'vitest';
import {
  analyzeHtml,
  buildAuditFindings,
  decodeHtmlEntities,
  isSocialOrDirectoryUrl,
  parsePageSpeedResponse,
} from '../src/audit';

const NOW = new Date('2026-10-09T10:00:00Z');

const OLD_SITE = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Restaurante O Lagar &ndash; Amadora</title>
<meta name="generator" content="WordPress 4.9.8">
<link rel="stylesheet" href="/wp-content/themes/x/style.css">
</head><body><h1>Bem-vindo</h1>
<script>var x = "© 2026";</script>
<footer>&copy; 2015 - 2019 Restaurante O Lagar. Todos os direitos reservados.</footer></body></html>`;

const MODERN_SITE = `<html><head>
<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1'>
<meta name="description" content="Clínica dentária na Amadora &amp; Lisboa">
<title>Clínica Sá</title></head><body><footer>© ${NOW.getFullYear()} Clínica Sá</footer>
<img src="https://static.wixstatic.com/media/a.jpg"></body></html>`;

describe('analyzeHtml', () => {
  it('lê título, CMS com versão e ano do copyright de um site antigo', () => {
    const facts = analyzeHtml(OLD_SITE, NOW);
    expect(facts).toEqual({
      title: 'Restaurante O Lagar – Amadora',
      meta_description: null,
      has_viewport: false,
      zoom_blocked: false,
      cms: 'WordPress 4.9.8',
      copyright_year: 2019,
    });
  });

  it('deteta viewport, zoom bloqueado, descrição e Wix', () => {
    const facts = analyzeHtml(MODERN_SITE, NOW);
    expect(facts.has_viewport).toBe(true);
    expect(facts.zoom_blocked).toBe(true);
    expect(facts.meta_description).toBe('Clínica dentária na Amadora & Lisboa');
    expect(facts.cms).toBe('Wix');
    expect(facts.copyright_year).toBe(2026);
  });

  it('ignora anos no futuro e textos sem copyright', () => {
    expect(analyzeHtml('<p>Desde 1990. Copyright 2099</p>', NOW).copyright_year).toBeNull();
  });
});

describe('decodeHtmlEntities', () => {
  it('descodifica entidades numéricas e com nome', () => {
    expect(decodeHtmlEntities('Caf&eacute; &#233; &#xE9; &amp; &foo;')).toBe('Café é é & &foo;');
  });
});

describe('isSocialOrDirectoryUrl', () => {
  it.each([
    ['https://www.facebook.com/olagar', true],
    ['https://m.instagram.com/olagar', true],
    ['https://www.google.com/maps/place/x', true],
    ['https://pt.tripadvisor.pt/Restaurant', true],
    ['https://olagar.pt', false],
    ['https://olagar.wixsite.com/site', false],
    ['não é url', false],
  ])('%s → %s', (url, expected) => {
    expect(isSocialOrDirectoryUrl(url)).toBe(expected);
  });
});

describe('parsePageSpeedResponse', () => {
  it('extrai a pontuação e as métricas', () => {
    const r = parsePageSpeedResponse({
      lighthouseResult: {
        categories: { performance: { score: 0.34 } },
        audits: {
          'largest-contentful-paint': { numericValue: 6234.4 },
          'first-contentful-paint': { numericValue: 2100.2 },
          'total-blocking-time': { numericValue: 880 },
          'cumulative-layout-shift': { numericValue: 0.12345 },
        },
      },
    });
    expect(r).toEqual({ score: 34, metrics: { lcp_ms: 6234, fcp_ms: 2100, tbt_ms: 880, cls: 0.123 } });
  });

  it('aguenta respostas incompletas', () => {
    expect(parsePageSpeedResponse(null)).toEqual({ score: null, metrics: {} });
  });
});

describe('buildAuditFindings', () => {
  it('site antigo sem HTTPS nem viewport e lento', () => {
    const f = buildAuditFindings(
      {
        own_site: true,
        reachable: true,
        http_status: 200,
        response_ms: 900,
        https: false,
        html: analyzeHtml(OLD_SITE, NOW),
        pagespeed: { score: 34, metrics: { lcp_ms: 6200 } },
      },
      NOW,
    );
    expect(f.issues.map((i) => i.code)).toEqual([
      'no_https',
      'no_viewport',
      'pagespeed_low',
      'slow_lcp',
      'no_meta_description',
      'outdated_copyright',
    ]);
    expect(f.suggested_problems).toBe(
      'Sem HTTPS; Não é responsivo; PageSpeed 34; Carrega em 6,2 s; Sem meta descrição; Copyright de 2019',
    );
    expect(f.suggested_mobile).toBe('nao');
  });

  it('site bom: sem problemas e mobile "sim"', () => {
    const f = buildAuditFindings(
      {
        own_site: true,
        reachable: true,
        http_status: 200,
        https: true,
        ssl_valid: true,
        ssl_expires_at: '2027-03-01T00:00:00Z',
        html: { ...analyzeHtml(MODERN_SITE, NOW), zoom_blocked: false },
        pagespeed: { score: 95, metrics: { lcp_ms: 1500 } },
      },
      NOW,
    );
    expect(f.issues).toEqual([]);
    expect(f.suggested_problems).toBeNull();
    expect(f.suggested_mobile).toBe('sim');
  });

  it('certificado a expirar e PageSpeed médio', () => {
    const f = buildAuditFindings(
      {
        own_site: true,
        reachable: true,
        https: true,
        ssl_valid: true,
        ssl_expires_at: '2026-10-14T10:00:00Z',
        pagespeed: { score: 70, metrics: {} },
      },
      NOW,
    );
    expect(f.issues.map((i) => i.code)).toEqual(['ssl_expiring', 'pagespeed_medium']);
    expect(f.issues[0]!.message).toContain('5 dias');
    expect(f.suggested_mobile).toBe('desconhecido');
  });

  it('sem site próprio ou inacessível', () => {
    expect(buildAuditFindings({ own_site: false, reachable: false }).suggested_problems).toBe(
      'Sem site próprio (só redes sociais)',
    );
    expect(buildAuditFindings({ own_site: true, reachable: false }).issues[0]!.code).toBe('unreachable');
  });
});
