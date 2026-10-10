/**
 * Serviços VNDesign: cada workspace gere a sua lista em Definições → Serviços
 * (tabela `services`). Os 8 serviços do site vndesign.pt (Web Design e Design
 * Gráfico) são o ponto de partida e o catálogo por omissão destas funções.
 *
 * As chaves ficam guardadas na base de dados (leads.services, service_packages.service,
 * task_templates.service) e não mudam; o nome, a categoria e o ícone podem mudar.
 */
import { z } from 'zod';
import { slugify } from './normalize';

export const SERVICE_CATEGORIES = ['web', 'grafico', 'outros'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  web: 'Web Design',
  grafico: 'Design Gráfico',
  outros: 'Outros serviços',
};

/** Os 8 serviços de origem (as chaves que a migração semeia em cada workspace). */
export const SERVICES = {
  landing_page: { label: 'Landing Pages', category: 'web', short: 'Landing', icon: 'layout' },
  site_institucional: { label: 'Sites Institucionais', category: 'web', short: 'Site', icon: 'building' },
  blog: { label: 'Blogs Personalizados', category: 'web', short: 'Blog', icon: 'newspaper' },
  loja_online: { label: 'Pequenas Lojas', category: 'web', short: 'Loja', icon: 'cart' },
  identidade_visual: { label: 'Identidade Visual', category: 'grafico', short: 'Identidade', icon: 'pen' },
  flyers_cartazes: { label: 'Flyers e Cartazes', category: 'grafico', short: 'Flyers', icon: 'file-image' },
  posts_redes: { label: 'Posts Rede Social', category: 'grafico', short: 'Posts', icon: 'images' },
  estampas: { label: 'Estampas T-shirts', category: 'grafico', short: 'T-shirts', icon: 'shirt' },
} as const satisfies Record<string, { label: string; category: ServiceCategory; short: string; icon: string }>;

/** Chave de um serviço ("landing_page", "fotografia"…): minúsculas, números e "_". */
export type ServiceKey = string;
/** Chaves dos serviços de origem. */
export const SERVICE_KEYS = Object.keys(SERVICES) as (keyof typeof SERVICES)[];

/** Ícones que se podem escolher para um serviço (a web desenha-os com o Lucide). */
export const SERVICE_ICONS = {
  layout: 'Página',
  building: 'Empresa',
  newspaper: 'Blog',
  cart: 'Loja',
  pen: 'Logótipo',
  'file-image': 'Flyer',
  images: 'Imagens',
  shirt: 'T-shirt',
  monitor: 'Ecrã',
  smartphone: 'Telemóvel',
  palette: 'Paleta',
  camera: 'Fotografia',
  video: 'Vídeo',
  megaphone: 'Publicidade',
  search: 'Pesquisa / SEO',
  mail: 'Email',
  printer: 'Impressão',
  package: 'Embalagem',
  book: 'Catálogo',
  presentation: 'Apresentação',
  wrench: 'Manutenção',
  briefcase: 'Consultoria',
  sparkles: 'Outro',
} as const;
export type ServiceIconKey = keyof typeof SERVICE_ICONS;
export const SERVICE_ICON_KEYS = Object.keys(SERVICE_ICONS) as ServiceIconKey[];

/** O que as funções abaixo precisam de saber de um serviço (da API ou de origem). */
export interface ServiceInfo {
  key: string;
  label: string;
  category: ServiceCategory;
  short_label?: string | null;
  icon?: string | null;
  archived_at?: string | null;
}

export const DEFAULT_SERVICES: ServiceInfo[] = SERVICE_KEYS.map((key) => ({
  key,
  label: SERVICES[key].label,
  category: SERVICES[key].category,
  short_label: SERVICES[key].short,
  icon: SERVICES[key].icon,
}));

const find = (key: string, catalog: readonly ServiceInfo[]) =>
  catalog.find((s) => s.key === key) ?? DEFAULT_SERVICES.find((s) => s.key === key);

export function serviceLabel(key: string, catalog: readonly ServiceInfo[] = DEFAULT_SERVICES): string {
  return find(key, catalog)?.label ?? key;
}

/** Nome curto para cartões ("Landing", "Site"); sem nome curto, a primeira palavra. */
export function serviceShortLabel(key: string, catalog: readonly ServiceInfo[] = DEFAULT_SERVICES): string {
  const info = find(key, catalog);
  if (!info) return key;
  if (info.short_label) return info.short_label;
  const first = info.label.split(/\s+/)[0] ?? info.label;
  return first.length > 14 ? `${first.slice(0, 13)}…` : first;
}

export function serviceCategory(key: string, catalog: readonly ServiceInfo[] = DEFAULT_SERVICES): ServiceCategory | null {
  return find(key, catalog)?.category ?? null;
}

/** Serviços (ativos) de uma categoria, pela ordem do catálogo. */
export function servicesOf(category: ServiceCategory, catalog: readonly ServiceInfo[] = DEFAULT_SERVICES): string[] {
  return catalog.filter((s) => s.category === category && !s.archived_at).map((s) => s.key);
}

/** Chave nova a partir do nome ("Fotografia de produto" → "fotografia_de_produto"), sem repetir as existentes. */
export function serviceKeyFromLabel(label: string, taken: Iterable<string> = []): string {
  const base = (slugify(label).replace(/-/g, '_').replace(/[^a-z0-9_]/g, '') || 'servico').slice(0, 40).replace(/_+$/, '');
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// -----------------------------------------------------------------------------
// Schemas da API (Definições → Serviços)
// -----------------------------------------------------------------------------

export const ServiceKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,48}$/, { error: 'Serviço desconhecido.' })
  .meta({ description: 'Chave do serviço (ver GET /services)' });

/** Lista de serviços sem repetições, pela ordem indicada. */
export const ServiceKeyListSchema = z
  .array(ServiceKeySchema)
  .max(50)
  .transform((list) => [...new Set(list)]);

export const ServiceCategorySchema = z.enum(SERVICE_CATEGORIES, { error: 'Categoria inválida.' });

export const ServiceSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    label: z.string(),
    short_label: z.string().nullable(),
    category: ServiceCategorySchema,
    icon: z.string().nullable(),
    sort_order: z.int(),
    archived_at: z.string().nullable(),
    lead_count: z.int().meta({ description: 'Leads com este serviço de interesse' }),
  })
  .meta({ id: 'Service' });
export type Service = z.infer<typeof ServiceSchema>;

const serviceLabelField = z.string().trim().min(1, { error: 'Indica o nome do serviço.' }).max(60, { error: 'Máximo de 60 caracteres.' });
const shortLabelField = z
  .string()
  .trim()
  .max(14, { error: 'Máximo de 14 caracteres.' })
  .nullish()
  .transform((v) => v || null);
const iconField = z.enum(SERVICE_ICON_KEYS as [ServiceIconKey, ...ServiceIconKey[]], { error: 'Ícone inválido.' });

export const ServiceCreateSchema = z
  .object({
    label: serviceLabelField,
    short_label: shortLabelField,
    category: ServiceCategorySchema.default('outros'),
    icon: iconField.default('sparkles'),
  })
  .meta({ id: 'ServiceCreate' });
export type ServiceCreate = z.output<typeof ServiceCreateSchema>;

// Sem valores por omissão (.partial() continuaria a aplicá-los).
export const ServiceUpdateSchema = z
  .object({
    label: serviceLabelField.optional(),
    short_label: shortLabelField.optional(),
    category: ServiceCategorySchema.optional(),
    icon: iconField.optional(),
    archived: z.boolean().optional().meta({ description: 'Esconder (true) ou voltar a mostrar (false)' }),
  })
  .meta({ id: 'ServiceUpdate' });
export type ServiceUpdate = z.output<typeof ServiceUpdateSchema>;

export const ServiceReorderSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(200) })
  .meta({ id: 'ServiceReorder' });

/** Nomes alternativos aceites na importação e na API (já em slug). */
const SERVICE_ALIASES: Record<string, keyof typeof SERVICES> = {
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
 * Aceita chaves, nomes do catálogo (os do workspace, quando indicado) e nomes
 * alternativos dos serviços de origem; ignora o resto. Fica pela ordem do catálogo.
 */
export function parseServices(value: unknown, catalog: readonly ServiceInfo[] = DEFAULT_SERVICES): string[] {
  const parts = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[,;/|\n+]+/)
      : [];
  const keys = new Set(catalog.map((s) => s.key));
  const found = new Set<string>();
  for (const part of parts) {
    const raw = part.trim();
    if (!raw) continue;
    if (keys.has(raw)) {
      found.add(raw);
      continue;
    }
    const slug = slugify(raw);
    const byLabel = catalog.find((s) => slugify(s.label) === slug || (s.short_label && slugify(s.short_label) === slug))?.key;
    const alias = SERVICE_ALIASES[slug] ?? SERVICE_ALIASES[slug.replace(/s$/, '')];
    const match = byLabel ?? (alias && keys.has(alias) ? alias : undefined);
    if (match) found.add(match);
  }
  return catalog.map((s) => s.key).filter((k) => found.has(k));
}
