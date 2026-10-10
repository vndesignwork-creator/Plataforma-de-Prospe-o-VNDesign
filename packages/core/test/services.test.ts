import { describe, expect, it } from 'vitest';
import { mapImportRow, suggestMapping } from '../src/import';
import { AiEmailRequestSchema, buildAiEmailPrompt } from '../src/ai';
import { ServicePackageUpdateSchema, suggestPackages } from '../src/proposals';
import { LeadCreateSchema } from '../src/schemas';
import { SERVICE_KEYS, parseServices, serviceCategory, servicesOf } from '../src/services';

describe('catálogo de serviços', () => {
  it('tem as duas categorias do site (4 + 4)', () => {
    expect(servicesOf('web')).toHaveLength(4);
    expect(servicesOf('grafico')).toHaveLength(4);
    expect(serviceCategory('posts_redes')).toBe('grafico');
    expect(SERVICE_KEYS).toHaveLength(8);
  });

  it('lê nomes do catálogo, chaves e nomes alternativos', () => {
    expect(parseServices('Logótipo; Posts Rede Social, t-shirts')).toEqual(['identidade_visual', 'posts_redes', 'estampas']);
    expect(parseServices('Site + Loja online')).toEqual(['site_institucional', 'loja_online']);
    expect(parseServices(['landing_page', 'cartazes', 'xpto'])).toEqual(['landing_page', 'flyers_cartazes']);
    expect(parseServices('nada disto')).toEqual([]);
  });

  it('o lead guarda os serviços sem repetidos e na ordem do catálogo', () => {
    const lead = LeadCreateSchema.parse({ company_name: 'X', services: ['posts_redes', 'landing_page', 'posts_redes'] });
    expect(lead.services).toEqual(['landing_page', 'posts_redes']);
    expect(LeadCreateSchema.safeParse({ company_name: 'X', services: ['outro'] }).success).toBe(false);
  });

  it('a coluna "Serviços" da folha é reconhecida e importada', () => {
    const headers = ['Empresa', 'Serviços'];
    const mapping = suggestMapping(headers);
    expect(mapping).toEqual(['company_name', 'services']);
    const result = mapImportRow(['Café Central', 'Identidade visual; menu'], mapping, []);
    expect(result.ok && result.value.lead.services).toEqual(['identidade_visual', 'flyers_cartazes']);
  });

  it('atualizar um pacote não muda a categoria se não for enviada', () => {
    expect(ServicePackageUpdateSchema.parse({ name: 'Logótipo' })).toEqual({ name: 'Logótipo' });
  });
});

describe('email com IA por serviço', () => {
  const ctx = {
    lead: { company_name: 'Café Central', services: ['posts_redes'] },
    sender: { name: 'Vá', portfolio: 'https://vndesign.pt', designPortfolio: 'https://vndesign.pt/design' },
  };

  it('propõe os serviços do lead e usa o portefólio de design', () => {
    const prompt = buildAiEmailPrompt(AiEmailRequestSchema.parse({}), ctx);
    expect(prompt).toContain('Serviços a propor: Posts Rede Social');
    expect(prompt).toContain('Portefólio de design gráfico: https://vndesign.pt/design');
    expect(prompt).not.toContain('Portefólio: https://vndesign.pt\n');
  });

  it('sem serviços, propõe um site (como antes)', () => {
    const prompt = buildAiEmailPrompt(AiEmailRequestSchema.parse({}), { ...ctx, lead: { company_name: 'X' } });
    expect(prompt).toContain('Serviços a propor: Sites Institucionais');
  });

  it('os serviços do pedido mandam sobre os do lead', () => {
    const prompt = buildAiEmailPrompt(AiEmailRequestSchema.parse({ services: ['identidade_visual', 'landing_page'] }), ctx);
    expect(prompt).toContain('Serviços a propor: Identidade Visual, Landing Pages');
  });
});

describe('pacotes sugeridos para uma proposta nova', () => {
  const pk = (id: string, service: string | null, recommended = false, name = id) =>
    ({ id, name, service, recommended, archived_at: null }) as const;
  const packages = [
    pk('essencial', 'landing_page'),
    pk('profissional', 'site_institucional', true),
    pk('logotipo', 'identidade_visual'),
    pk('identidade', 'identidade_visual', true),
    pk('posts', 'posts_redes', false, 'Redes Sociais — 12 posts/mês'),
  ];

  it('um pacote por serviço de interesse (o recomendado desse serviço)', () => {
    expect(suggestPackages(packages, ['site_institucional', 'identidade_visual']).map((p) => p.id)).toEqual(['profissional', 'identidade']);
  });

  it('não sugere pacotes mensais e, sem correspondência, usa o recomendado geral', () => {
    expect(suggestPackages(packages, ['posts_redes']).map((p) => p.id)).toEqual(['profissional']);
    expect(suggestPackages(packages, []).map((p) => p.id)).toEqual(['profissional']);
  });
});
