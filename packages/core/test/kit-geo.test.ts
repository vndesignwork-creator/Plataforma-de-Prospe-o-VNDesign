import { describe, expect, it } from 'vitest';
import {
  buildBusinessJsonLd,
  buildFaqHtml,
  buildFaqJsonLd,
  buildLlmsTxt,
  businessFromLead,
  buildTemplateContext,
  googleComparison,
  googleMapsSearchUrl,
  googleProfileUnconfirmed,
  guessBusinessType,
  jsonLdScript,
  parseGoogleProfiles,
  renderTemplate,
  similarCompanyName,
  toOpeningHours,
} from '../src';

const lead = {
  company_name: 'API Construções',
  website: 'https://apiconstrucoes.pt',
  source_url: 'https://www.facebook.com/apiconstrucoes',
  phone: '214 768 160',
  email: 'geral@apiconstrucoes.pt',
  address: 'Rua das Obras 12, 2610-123 Amadora',
  city: 'Amadora',
  sector: { name: 'Construção civil' },
};

describe('Kit GEO: dados estruturados', () => {
  it('sugere o tipo pelo setor e lê a morada e as redes da ficha', () => {
    expect(guessBusinessType('Restauração')).toBe('Restaurant');
    expect(guessBusinessType(null)).toBe('LocalBusiness');
    const b = businessFromLead(lead, ['Sites Institucionais']);
    expect(b).toMatchObject({ type: 'HomeAndConstructionBusiness', street: 'Rua das Obras 12', postal_code: '2610-123', city: 'Amadora', url: 'https://apiconstrucoes.pt' });
    expect(b.same_as).toEqual(['https://www.facebook.com/apiconstrucoes']);
  });

  it('horário em português → openingHours', () => {
    expect(toOpeningHours('Seg–Sex 09:00–18:00')).toBe('Mo-Fr 09:00-18:00');
    expect(toOpeningHours('Sáb 9h00-13h00')).toBe('Sa 09:00-13:00');
    expect(toOpeningHours('quando calhar')).toBeNull();
  });

  it('JSON-LD do negócio, sem campos vazios, e o <script> seguro', () => {
    const b = { ...businessFromLead(lead, ['Remodelações']), opening_hours: ['Seg-Sex 09:00-18:00'] };
    const ld = buildBusinessJsonLd(b);
    expect(ld).toMatchObject({
      '@type': 'HomeAndConstructionBusiness',
      name: 'API Construções',
      telephone: '214 768 160',
      address: { '@type': 'PostalAddress', postalCode: '2610-123', addressCountry: 'PT' },
      openingHours: ['Mo-Fr 09:00-18:00'],
    });
    expect(ld).not.toHaveProperty('description');
    expect(jsonLdScript({ name: '</script><b>' })).not.toContain('</script><b>');
  });
});

describe('Kit GEO: perguntas frequentes e llms.txt', () => {
  const faq = [{ question: 'Fazem orçamentos grátis?', answer: 'Sim, a API Construções faz orçamentos sem compromisso na Amadora.' }];
  it('FAQPage e HTML (com escape)', () => {
    expect(buildFaqJsonLd(faq)).toMatchObject({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Fazem orçamentos grátis?' }] });
    expect(buildFaqHtml([{ question: 'A <b>?', answer: 'x & y' }])).toContain('A &lt;b&gt;?');
  });
  it('llms.txt com contactos, serviços e perguntas', () => {
    const txt = buildLlmsTxt(businessFromLead(lead, ['Remodelações']), faq);
    expect(txt.startsWith('# API Construções\n')).toBe(true);
    expect(txt).toContain('- Telefone: 214 768 160');
    expect(txt).toContain('## Serviços\n\n- Remodelações');
    expect(txt).toContain('### Fazem orçamentos grátis?');
  });
});

describe('Kit GEO: perfil do Google', () => {
  it('lê a resposta da IA e ignora números de perfis não encontrados', () => {
    const p = parseGoogleProfiles(
      { perfis: [{ encontrado: true, nota: '4,6', avaliacoes: 87, link_maps: 'https://maps.google.com/x', morada: null }, { encontrado: false, nota: 5, avaliacoes: 3 }] },
      ['A', 'B'],
    );
    expect(p[0]).toMatchObject({ name: 'A', found: true, rating: 4.6, reviews: 87 });
    expect(p[1]).toMatchObject({ name: 'B', found: false, rating: null, reviews: null });
  });
  it('frase de comparação para o cliente', () => {
    const mk = (rating: number | null, reviews: number | null, found = true) => ({ name: 'x', found, rating, reviews, maps_url: null, address: null });
    expect(googleComparison({ lead: mk(4.2, 18), competitors: [mk(4.6, 100), mk(4.8, 140)] })).toBe(
      'No Google Maps, a sua empresa tem 4,2★ com 18 avaliações; os concorrentes que as IAs recomendam têm em média 4,7★ e 120 avaliações.',
    );
    // Só a Google Places API pode dizer que não há perfil; pela pesquisa da IA fica "não confirmado" (sem frase).
    expect(googleComparison({ source: 'places', lead: mk(null, null, false), competitors: [] })).toBe('A sua empresa não aparece no Google Maps.');
    expect(googleComparison({ source: 'ia', lead: mk(null, null, false), competitors: [mk(4.6, 100)] })).toBeNull();
    expect(googleProfileUnconfirmed({ source: 'ia' }, mk(null, null, false))).toBe(true);
    expect(googleProfileUnconfirmed({ source: 'places' }, mk(null, null, false))).toBe(false);
  });
  it('nomes escritos de outra forma e pesquisa no Maps', () => {
    expect(similarCompanyName('LANG — Sociedade de Construções e Projectos, Lda.', 'LANG - Soc. Construções e Projectos, lda')).toBe(true);
    expect(similarCompanyName('API Construções', 'Api-construções Lda')).toBe(true);
    expect(similarCompanyName('API Construções', 'Lusa Construções')).toBe(false);
    expect(googleMapsSearchUrl('API Construções', 'Amadora')).toBe('https://www.google.com/maps/search/?api=1&query=API%20Constru%C3%A7%C3%B5es%20Amadora');
  });
});

describe('scripts: {{visibilidade_ia}}', () => {
  it('usa a frase do último teste, ou a alternativa', () => {
    const ctx = buildTemplateContext({ today: '2026-10-23', aiVisibility: 'A sua empresa não aparece.' });
    expect(renderTemplate('Teste: {{visibilidade_ia|sem teste}}', ctx).text).toBe('Teste: A sua empresa não aparece.');
    expect(renderTemplate('Teste: {{visibilidade_ia|sem teste}}', buildTemplateContext({ today: '2026-10-23' })).text).toBe('Teste: sem teste');
  });
});
