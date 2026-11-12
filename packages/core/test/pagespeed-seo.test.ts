import { describe, expect, it } from 'vitest';
import { buildAuditFindings, parsePageSpeedResponse } from '../src/audit';

const psi = (audits: Record<string, { score: number | null }>) => ({ lighthouseResult: { categories: { performance: { score: 0.75 } }, audits } });

describe('PageSpeed: o que o Google viu (categoria SEO)', () => {
  it('lê título, meta descrição e viewport (sem resultado = não verificado)', () => {
    expect(parsePageSpeedResponse(psi({ 'document-title': { score: 1 }, 'meta-description': { score: 0 }, viewport: { score: null } })).seo).toEqual({
      has_title: true,
      has_meta_description: false,
    });
    expect(parsePageSpeedResponse(psi({})).seo).toBeUndefined();
  });
  it('sem o HTML lido (site que bloqueia a plataforma), os problemas vêm do Google', () => {
    const pagespeed = parsePageSpeedResponse(psi({ 'document-title': { score: 1 }, 'meta-description': { score: 0 }, viewport: { score: 0 } }));
    const codes = buildAuditFindings({ own_site: true, reachable: true, html: null, pagespeed }).issues.map((i) => i.code);
    expect(codes).toContain('no_meta_description');
    expect(codes).toContain('no_viewport');
    expect(codes).not.toContain('no_title');
  });
});
