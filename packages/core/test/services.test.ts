import { describe, expect, it } from 'vitest';
import { mapImportRow, suggestMapping } from '../src/import';
import { AiEmailRequestSchema, buildAiEmailPrompt } from '../src/ai';
import { ServicePackageUpdateSchema, suggestPackages } from '../src/proposals';
import { LeadCreateSchema } from '../src/schemas';
import {
  SERVICE_KEYS,
  ServiceCategoryCreateSchema,
  ServiceCategoryUpdateSchema,
  ServiceCreateSchema,
  categoryLabel,
  ServiceUpdateSchema,
  parseServices,
  serviceCategory,
  serviceKeyFromLabel,
  serviceLabel,
  serviceShortLabel,
  servicesOf,
  type ServiceInfo,
} from '../src/services';

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

  it('o lead guarda os serviços sem repetidos (a base de dados confirma que existem)', () => {
    const lead = LeadCreateSchema.parse({ company_name: 'X', services: ['posts_redes', 'landing_page', 'posts_redes'] });
    expect(lead.services).toEqual(['posts_redes', 'landing_page']);
    expect(LeadCreateSchema.safeParse({ company_name: 'X', services: ['Outro serviço!'] }).success).toBe(false);
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

describe('serviços geridos em Definições', () => {
  const catalog: ServiceInfo[] = [
    { key: 'site_institucional', label: 'Sites', category: 'web' },
    { key: 'fotografia_de_produto', label: 'Fotografia de produto', category: 'outros', short_label: 'Fotos' },
    { key: 'gestao_redes', label: 'Gestão de redes sociais', category: 'outros' },
  ];

  it('a chave nasce do nome e não repete as existentes', () => {
    expect(serviceKeyFromLabel('Fotografia de Produto')).toBe('fotografia_de_produto');
    expect(serviceKeyFromLabel('Vídeo', ['video'])).toBe('video_2');
    expect(serviceKeyFromLabel('Vídeo', ['video', 'video_2'])).toBe('video_3');
    expect(serviceKeyFromLabel('!!!')).toBe('servico');
  });

  it('nomes, nomes curtos e categorias vêm do catálogo do workspace', () => {
    expect(serviceLabel('fotografia_de_produto', catalog)).toBe('Fotografia de produto');
    expect(serviceShortLabel('fotografia_de_produto', catalog)).toBe('Fotos');
    expect(serviceShortLabel('gestao_redes', catalog)).toBe('Gestão');
    expect(serviceCategory('gestao_redes', catalog)).toBe('outros');
    expect(servicesOf('outros', catalog)).toEqual(['fotografia_de_produto', 'gestao_redes']);
    // Desconhecido: mostra a chave.
    expect(serviceLabel('xpto', catalog)).toBe('xpto');
  });

  it('a importação reconhece os serviços novos pelo nome ou nome curto', () => {
    expect(parseServices('Fotos; gestão de redes sociais, site', catalog)).toEqual([
      'site_institucional',
      'fotografia_de_produto',
      'gestao_redes',
    ]);
    // Um alias de origem cujo serviço não existe no workspace é ignorado.
    expect(parseServices('logótipo', catalog)).toEqual([]);
    const result = mapImportRow(['Estúdio', 'Fotos'], ['company_name', 'services'], [], catalog);
    expect(result.ok && result.value.lead.services).toEqual(['fotografia_de_produto']);
  });

  it('criar e editar um serviço', () => {
    expect(ServiceCreateSchema.parse({ label: ' Fotografia ' })).toEqual({
      label: 'Fotografia',
      short_label: null,
      category: 'outros',
      icon: 'sparkles',
    });
    expect(ServiceCreateSchema.safeParse({ label: '' }).success).toBe(false);
    expect(ServiceCreateSchema.safeParse({ label: 'X', icon: 'foguetao' }).success).toBe(false);
    expect(ServiceUpdateSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(ServiceCategoryCreateSchema.parse({ label: 'Vídeo' })).toEqual({ label: 'Vídeo', icon: 'grid', design_portfolio: false });
    expect(ServiceCategoryUpdateSchema.parse({ design_portfolio: true })).toEqual({ design_portfolio: true });
    expect(categoryLabel('grafico')).toBe('Design Gráfico');
    expect(categoryLabel('video', [{ key: 'video', label: 'Vídeo' }])).toBe('Vídeo');
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

  it('usa os nomes dos serviços do workspace', () => {
    const prompt = buildAiEmailPrompt(AiEmailRequestSchema.parse({ services: ['fotografia'] }), {
      ...ctx,
      services: [{ key: 'fotografia', label: 'Fotografia de produto', category: 'outros' }],
    });
    expect(prompt).toContain('Serviços a propor: Fotografia de produto');
  });

  it('o portefólio de design segue a opção da categoria', () => {
    const services = [{ key: 'reels', label: 'Reels', category: 'video' }];
    const request = AiEmailRequestSchema.parse({ services: ['reels'] });
    const withDesign = buildAiEmailPrompt(request, {
      ...ctx,
      services,
      categories: [{ key: 'video', label: 'Vídeo', design_portfolio: true }],
    });
    expect(withDesign).toContain('Portefólio de design gráfico: https://vndesign.pt/design');
    const without = buildAiEmailPrompt(request, { ...ctx, services, categories: [{ key: 'video', label: 'Vídeo' }] });
    expect(without).not.toContain('Portefólio de design gráfico');
    expect(without).toContain('Portefólio: https://vndesign.pt');
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
