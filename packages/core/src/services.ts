/**
 * Catálogo de serviços VNDesign (os mesmos do site vndesign.pt):
 * Web Design e Design Gráfico. Um lead pode ter vários "serviços de interesse";
 * os pacotes das propostas pertencem a uma categoria (e, opcionalmente, a um serviço).
 *
 * As chaves são guardadas na base de dados (leads.services, service_packages.service):
 * se mudares a lista, muda também a verificação na migração *_servicos_design_grafico.sql.
 */
import { slugify } from './normalize';

export const SERVICE_CATEGORIES = ['web', 'grafico'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  web: 'Web Design',
  grafico: 'Design Gráfico',
};

export const SERVICES = {
  landing_page: { label: 'Landing Pages', category: 'web' },
  site_institucional: { label: 'Sites Institucionais', category: 'web' },
  blog: { label: 'Blogs Personalizados', category: 'web' },
  loja_online: { label: 'Pequenas Lojas', category: 'web' },
  identidade_visual: { label: 'Identidade Visual', category: 'grafico' },
  flyers_cartazes: { label: 'Flyers e Cartazes', category: 'grafico' },
  posts_redes: { label: 'Posts Rede Social', category: 'grafico' },
  estampas: { label: 'Estampas T-shirts', category: 'grafico' },
} as const satisfies Record<string, { label: string; category: ServiceCategory }>;

export type ServiceKey = keyof typeof SERVICES;
export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

export function serviceLabel(key: string): string {
  return (SERVICES as Record<string, { label: string }>)[key]?.label ?? key;
}

export function serviceCategory(key: string): ServiceCategory | null {
  return (SERVICES as Record<string, { category: ServiceCategory }>)[key]?.category ?? null;
}

/** Serviços de uma categoria, pela ordem do catálogo. */
export function servicesOf(category: ServiceCategory): ServiceKey[] {
  return SERVICE_KEYS.filter((k) => SERVICES[k].category === category);
}

/** Nomes alternativos aceites na importação e na API (já em slug). */
const SERVICE_ALIASES: Record<string, ServiceKey> = {
  landing: 'landing_page',
  'landing-page': 'landing_page',
  'one-page': 'landing_page',
  onepage: 'landing_page',
  site: 'site_institucional',
  website: 'site_institucional',
  'site-institucional': 'site_institucional',
  'novo-site': 'site_institucional',
  redesign: 'site_institucional',
  blog: 'blog',
  loja: 'loja_online',
  'loja-online': 'loja_online',
  ecommerce: 'loja_online',
  'e-commerce': 'loja_online',
  logo: 'identidade_visual',
  logotipo: 'identidade_visual',
  marca: 'identidade_visual',
  branding: 'identidade_visual',
  'identidade-visual': 'identidade_visual',
  flyer: 'flyers_cartazes',
  flyers: 'flyers_cartazes',
  folheto: 'flyers_cartazes',
  cartaz: 'flyers_cartazes',
  cartazes: 'flyers_cartazes',
  menu: 'flyers_cartazes',
  ementa: 'flyers_cartazes',
  posts: 'posts_redes',
  'redes-sociais': 'posts_redes',
  instagram: 'posts_redes',
  'social-media': 'posts_redes',
  estampa: 'estampas',
  't-shirt': 'estampas',
  't-shirts': 'estampas',
  tshirt: 'estampas',
  tshirts: 'estampas',
};

/**
 * "Logótipo; Posts redes sociais" → ['identidade_visual', 'posts_redes'].
 * Aceita chaves, nomes do catálogo e nomes alternativos; ignora o resto.
 */
export function parseServices(value: unknown): ServiceKey[] {
  const parts = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[,;/|\n+]+/)
      : [];
  const found = new Set<ServiceKey>();
  for (const part of parts) {
    const raw = part.trim();
    if (!raw) continue;
    if (raw in SERVICES) {
      found.add(raw as ServiceKey);
      continue;
    }
    const slug = slugify(raw);
    const byLabel = SERVICE_KEYS.find((k) => slugify(SERVICES[k].label) === slug);
    const match = byLabel ?? SERVICE_ALIASES[slug] ?? SERVICE_ALIASES[slug.replace(/s$/, '')];
    if (match) found.add(match);
  }
  return SERVICE_KEYS.filter((k) => found.has(k));
}
