import { describe, expect, it } from 'vitest';
import { aiBotsBlockedByRobots, analyzeGeoHtml, analyzeHtml, buildAuditFindings, geoChecklist, type GeoFacts } from '../src';

const words = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(' ');

describe('GEO: o que a página mostra às IAs', () => {
  it('lê o JSON-LD do negócio, contactos, FAQ e mapa', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":["HomeAndConstructionBusiness"],"telephone":"+351 214 768 160","address":{"@type":"PostalAddress","streetAddress":"Rua A"}}]}</script>
      <script type="application/ld+json">{"@type":"FAQPage"}</script>
    </head><body><h2>Contactos</h2><a href="https://maps.app.goo.gl/abc">Mapa</a><p>${words(320)}</p></body></html>`;
    const geo = analyzeGeoHtml(html);
    expect(geo.structured_types).toEqual(expect.arrayContaining(['WebSite', 'HomeAndConstructionBusiness', 'PostalAddress', 'FAQPage']));
    expect(geo).toMatchObject({ business_schema: true, faq: true, phone: true, address: true, maps_link: true });
    expect(geo.word_count).toBeGreaterThanOrEqual(320);
  });

  it('site simples: sem dados estruturados, telefone no texto e código postal', () => {
    const geo = analyzeGeoHtml('<body><p>Ligue 912 345 678 · Rua das Flores, 2750-123 Cascais</p><h3>Perguntas frequentes</h3></body>');
    expect(geo).toMatchObject({ business_schema: false, phone: true, address: true, faq: true, maps_link: false });
  });

  it('JSON-LD inválido não rebenta a análise', () => {
    expect(analyzeGeoHtml('<script type="application/ld+json">{ isto não é json</script><p>olá</p>').structured_types).toEqual([]);
  });
});

describe('GEO: robots.txt', () => {
  it('bloqueio só para os robôs das IAs', () => {
    const robots = 'User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /';
    expect(aiBotsBlockedByRobots(robots)).toEqual(['GPTBot', 'ClaudeBot', 'Google-Extended']);
  });
  it('"User-agent: *" com "Disallow: /" bloqueia todos (exceto os que têm grupo próprio a permitir)', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: PerplexityBot\nAllow: /';
    const blocked = aiBotsBlockedByRobots(robots);
    expect(blocked).toContain('GPTBot');
    expect(blocked).not.toContain('PerplexityBot');
  });
  it('robots.txt normal do WordPress não bloqueia nada', () => {
    expect(aiBotsBlockedByRobots('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n# Disallow: /')).toEqual([]);
  });
});

describe('GEO: problemas e resumo', () => {
  const html = analyzeHtml('<title>T</title><meta name="description" content="d"><meta name="viewport" content="width=device-width">');
  const base: GeoFacts = { structured_types: [], business_schema: false, faq: false, word_count: 120, phone: false, address: false, maps_link: false, ai_bots_blocked: ['GPTBot', 'Google-Extended'] };

  it('gera os problemas GEO; FAQ e mapa não entram na coluna "Problemas"', () => {
    const f = buildAuditFindings({ own_site: true, reachable: true, https: true, ssl_valid: true, html, geo: base });
    expect(f.issues.map((i) => i.code)).toEqual(['ai_bots_blocked', 'no_structured_data', 'thin_content', 'no_contact_info', 'no_faq', 'no_maps_link']);
    expect(f.issues[0]!.message).toContain('GPTBot');
    expect(f.issues[0]!.message).not.toContain('Google-Extended');
    expect(f.suggested_problems).toBe('Bloqueia as IAs; Sem dados estruturados; Pouco conteúdo; Sem contactos visíveis');
  });

  it('bloquear só o Google-Extended (treino do Gemini) não é problema', () => {
    const f = buildAuditFindings({ own_site: true, reachable: true, html, geo: { ...base, ai_bots_blocked: ['Google-Extended'] } });
    expect(f.issues.map((i) => i.code)).not.toContain('ai_bots_blocked');
  });

  it('resumo "x de y" (sem robots.txt lido, esse ponto não conta)', () => {
    const ok: GeoFacts = { ...base, business_schema: true, faq: true, word_count: 800, phone: true, address: true, maps_link: true, ai_bots_blocked: [] };
    expect(geoChecklist(ok).every((c) => c.ok)).toBe(true);
    expect(geoChecklist({ ...ok, ai_bots_blocked: null })).toHaveLength(5);
  });
});
