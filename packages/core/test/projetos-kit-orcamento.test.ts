import { describe, expect, it } from 'vitest';
import {
  BrandColorSchema,
  BrandKitUpdateSchema,
  ClientProjectCreateSchema,
  DEFAULT_QUOTE_SETTINGS,
  LeadAccessUpsertSchema,
  WorkspaceSettingsSchema,
  computeQuote,
  projectLabel,
  quoteProposalItems,
  type QuoteLine,
} from '../src';

const line = (price: number, hours: number | null, extra: Partial<QuoteLine> = {}): QuoteLine => ({
  name: 'Item',
  price,
  quantity: 1,
  recurring: false,
  hours,
  ...extra,
});

describe('vários projetos por cliente', () => {
  it('valida o nome do projeto', () => {
    expect(ClientProjectCreateSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(ClientProjectCreateSchema.parse({ title: ' Loja online ' }).title).toBe('Loja online');
  });

  it('mostra o nome do projeto ao lado do cliente', () => {
    expect(projectLabel({ company_name: 'Padaria Sol', project_title: 'Loja online' })).toBe('Padaria Sol · Loja online');
    expect(projectLabel({ company_name: 'Padaria Sol', project_title: null })).toBe('Padaria Sol');
  });
});

describe('kit da marca', () => {
  it('normaliza as cores', () => {
    expect(BrandColorSchema.parse({ hex: 'EF5C32' }).hex).toBe('#ef5c32');
    expect(BrandColorSchema.parse({ name: 'Laranja', hex: '#FFF' })).toEqual({ name: 'Laranja', hex: '#fff' });
    expect(BrandColorSchema.safeParse({ hex: 'laranja' }).success).toBe(false);
  });

  it('aceita só links http(s) e notas vazias ficam a null', () => {
    expect(BrandKitUpdateSchema.safeParse({ links: [{ url: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(BrandKitUpdateSchema.parse({ links: [{ url: 'https://figma.com/x' }], notes: '  ' })).toEqual({
      links: [{ label: '', url: 'https://figma.com/x' }],
      notes: null,
    });
  });

  it('acessos: palavra-passe vazia mantém a guardada, null apaga-a', () => {
    expect(LeadAccessUpsertSchema.parse({ label: 'Alojamento', secret: '' })).toMatchObject({ label: 'Alojamento', secret: '', shared: false, url: null });
    expect(LeadAccessUpsertSchema.parse({ label: 'Domínio', secret: null }).secret).toBeNull();
    expect(LeadAccessUpsertSchema.safeParse({ label: '' }).success).toBe(false);
  });
});

describe('calculadora de orçamento', () => {
  it('soma pacotes e extras, aplica a urgência e o desconto', () => {
    const r = computeQuote([line(900, 20), line(80, 6, { quantity: 2 }), line(35, 1, { recurring: true })], [{ name: 'Urgência', percent: 20 }], 50, 35);
    // 900 + 160 = 1060; +20% = 1272; −50 = 1222
    expect(r.once).toBe(1272);
    expect(r.discount).toBe(50);
    expect(r.total).toBe(1222);
    expect(r.monthly).toBe(35);
    expect(r.hours).toBe(26);
    expect(r.rate).toBe(47);
    // 26 h × 35 €/h = 910 → arredonda a 5 €
    expect(r.suggested).toBe(910);
  });

  it('sem horas de um pacote não estima (a não ser que se indiquem)', () => {
    const lines = [line(900, null), line(80, 3)];
    expect(computeQuote(lines, [], 0, 35)).toMatchObject({ hours: null, rate: null, suggested: null });
    expect(computeQuote(lines, [], 0, 35, 40)).toMatchObject({ hours: 40, rate: 24.5, suggested: 1400 });
  });

  it('o desconto não passa do total', () => {
    expect(computeQuote([line(100, 2)], [], 500, null)).toMatchObject({ total: 0, discount: 100, suggested: null });
  });

  it('itens da proposta: a percentagem passa a euros', () => {
    const items = quoteProposalItems([line(1000, 10, { name: 'Site', package_id: null }), line(35, 1, { name: 'Manutenção', recurring: true })], [
      { name: 'Urgência', percent: 20 },
    ]);
    expect(items.map((i) => [i.name, i.price, i.recurring])).toEqual([
      ['Site', 1000, false],
      ['Manutenção', 35, true],
      ['Urgência (+20%)', 200, false],
    ]);
  });

  it('as definições trazem os extras de origem', () => {
    const settings = WorkspaceSettingsSchema.parse({});
    expect(settings.quote).toEqual(DEFAULT_QUOTE_SETTINGS);
    expect(settings.features.quote_calculator).toBe(true);
    expect(settings.features.brand_kit).toBe(true);
  });
});
