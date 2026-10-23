/**
 * Kit GEO de um lead/cliente (o que se entrega para o site aparecer nas IAs):
 *  - dados estruturados schema.org do negócio (JSON-LD, pronto a colar);
 *  - llms.txt (resumo do negócio para as IAs, na raiz do site);
 *  - perguntas frequentes (geradas pela IA) em HTML e em JSON-LD FAQPage;
 *  - perfil do Google (nota e avaliações), comparado com os concorrentes.
 */
import { z } from 'zod';
import { isSocialUrl } from './links';

// -----------------------------------------------------------------------------
// Dados do negócio (editáveis)
// -----------------------------------------------------------------------------

/** Tipos schema.org mais comuns nos clientes (o 1.º é o genérico). */
export const SCHEMA_BUSINESS_TYPES = [
  { value: 'LocalBusiness', label: 'Negócio local (genérico)', match: null },
  { value: 'ProfessionalService', label: 'Serviços profissionais', match: /consultor|servi[cç]os|design|marketing|ag[eê]ncia|inform[aá]tica/i },
  { value: 'HomeAndConstructionBusiness', label: 'Construção e obras', match: /constru|obra|remodela|canaliz|eletric|pintur|carpint|serralh/i },
  { value: 'Restaurant', label: 'Restaurante', match: /restaura|tasca|marisqueira|pizzaria|churrasq/i },
  { value: 'CafeOrCoffeeShop', label: 'Café / pastelaria', match: /caf[eé]|pastelaria/i },
  { value: 'Bakery', label: 'Padaria', match: /padaria|panifica/i },
  { value: 'Store', label: 'Loja', match: /loja|com[eé]rcio|retalho/i },
  { value: 'BeautySalon', label: 'Cabeleireiro / estética', match: /cabeleir|est[eé]tica|beleza|barbe|unhas|spa/i },
  { value: 'Dentist', label: 'Dentista', match: /dent/i },
  { value: 'MedicalClinic', label: 'Clínica', match: /cl[ií]nica|sa[uú]de|fisioter|m[eé]dic/i },
  { value: 'AutoRepair', label: 'Oficina auto', match: /oficina|autom[oó]vel|mec[aâ]nic|pneus/i },
  { value: 'RealEstateAgent', label: 'Imobiliária', match: /imobili/i },
  { value: 'LegalService', label: 'Advogados / jurídico', match: /advoga|jur[ií]dic|solicitador/i },
  { value: 'AccountingService', label: 'Contabilidade', match: /contab/i },
  { value: 'LodgingBusiness', label: 'Alojamento / hotel', match: /hotel|alojamento|hostel|turismo rural|guest/i },
  { value: 'SportsActivityLocation', label: 'Ginásio / desporto', match: /gin[aá]sio|desport|fitness|pilates|yoga/i },
  { value: 'EducationalOrganization', label: 'Escola / formação', match: /escola|forma[cç][aã]o|explica|col[eé]gio/i },
] as const;
export type SchemaBusinessType = (typeof SCHEMA_BUSINESS_TYPES)[number]['value'];
const TYPE_VALUES = SCHEMA_BUSINESS_TYPES.map((t) => t.value) as [SchemaBusinessType, ...SchemaBusinessType[]];

const optText = (max: number) => z.string().trim().max(max).nullable().default(null);

export const GeoBusinessSchema = z
  .object({
    type: z.enum(TYPE_VALUES).default('LocalBusiness'),
    name: z.string().trim().min(1, { error: 'Falta o nome.' }).max(160),
    description: optText(600),
    url: optText(300),
    phone: optText(40),
    email: optText(254),
    street: optText(200),
    postal_code: optText(12),
    city: optText(120),
    /** Horário em linguagem simples, uma linha por período ("Seg–Sex 09:00–18:00"). */
    opening_hours: z.array(z.string().trim().min(3).max(80)).max(10).default([]),
    /** Redes sociais e perfis (Facebook, Instagram, Google Maps…). */
    same_as: z.array(z.string().trim().max(300)).max(10).default([]),
    area_served: optText(200),
    price_range: optText(20),
    services: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  })
  .meta({ id: 'GeoBusiness' });
export type GeoBusiness = z.infer<typeof GeoBusinessSchema>;

/** Tipo schema.org mais provável pelo setor do lead. */
export function guessBusinessType(sector: string | null | undefined): SchemaBusinessType {
  if (!sector) return 'LocalBusiness';
  return SCHEMA_BUSINESS_TYPES.find((t) => t.match && t.match.test(sector))?.value ?? 'LocalBusiness';
}

/** Ponto de partida a partir da ficha do lead (depois edita-se). */
export function businessFromLead(lead: {
  company_name: string;
  website: string | null;
  source_url?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  sector?: { name: string } | null;
  services?: string[];
  approach_angle?: string | null;
}, serviceLabels: string[] = []): GeoBusiness {
  const postal = lead.address?.match(/\b\d{4}\s?-\s?\d{3}\b/)?.[0]?.replace(/\s/g, '') ?? null;
  const street = lead.address ? lead.address.replace(/,?\s*\b\d{4}\s?-\s?\d{3}\b.*$/, '').trim() || null : null;
  const social = [lead.website, lead.source_url].filter((u): u is string => !!u && isSocialUrl(u));
  const own = lead.website && !isSocialUrl(lead.website) ? lead.website : null;
  return GeoBusinessSchema.parse({
    type: guessBusinessType(lead.sector?.name),
    name: lead.company_name,
    description: null,
    url: own,
    phone: lead.phone,
    email: lead.email,
    street,
    postal_code: postal,
    city: lead.city,
    same_as: social,
    area_served: lead.city,
    services: serviceLabels,
  });
}

// -----------------------------------------------------------------------------
// JSON-LD
// -----------------------------------------------------------------------------

const DAYS: Record<string, string> = {
  seg: 'Mo', segunda: 'Mo', ter: 'Tu', terca: 'Tu', terça: 'Tu', qua: 'We', quarta: 'We', qui: 'Th', quinta: 'Th',
  sex: 'Fr', sexta: 'Fr', sab: 'Sa', sáb: 'Sa', sabado: 'Sa', sábado: 'Sa', dom: 'Su', domingo: 'Su',
};

/** "Seg–Sex 09:00–18:00" → "Mo-Fr 09:00-18:00" (formato openingHours do schema.org). */
export function toOpeningHours(line: string): string | null {
  const m = line
    .trim()
    .toLowerCase()
    .match(/^([a-zçáé]+)\.?\s*(?:[-–a]\s*([a-zçáé]+)\.?)?\s*:?\s*(\d{1,2})[:h](\d{2})\s*[-–a]+\s*(\d{1,2})[:h](\d{2})$/);
  if (!m) return null;
  const from = DAYS[m[1]!];
  const to = m[2] ? DAYS[m[2]] : null;
  if (!from || (m[2] && !to)) return null;
  const hh = (h: string, mm: string) => `${h.padStart(2, '0')}:${mm}`;
  return `${to ? `${from}-${to}` : from} ${hh(m[3]!, m[4]!)}-${hh(m[5]!, m[6]!)}`;
}

const compact = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));

/** Dados estruturados do negócio (schema.org), prontos para JSON-LD. */
export function buildBusinessJsonLd(b: GeoBusiness): Record<string, unknown> {
  const address = b.street || b.postal_code || b.city
    ? compact({ '@type': 'PostalAddress', streetAddress: b.street, postalCode: b.postal_code, addressLocality: b.city, addressCountry: 'PT' })
    : null;
  const hours = b.opening_hours.map(toOpeningHours).filter((h): h is string => !!h);
  return compact({
    '@context': 'https://schema.org',
    '@type': b.type,
    name: b.name,
    description: b.description,
    url: b.url,
    telephone: b.phone,
    email: b.email,
    address,
    openingHours: hours,
    sameAs: b.same_as.filter(Boolean),
    areaServed: b.area_served,
    priceRange: b.price_range,
    makesOffer: b.services.length ? b.services.map((name) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name } })) : null,
  });
}

/** O bloco <script> para colar no <head> (ou num elemento "Código" do Bricks). */
export function jsonLdScript(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</script>`;
}

// -----------------------------------------------------------------------------
// Perguntas frequentes
// -----------------------------------------------------------------------------

export const GeoFaqItemSchema = z.object({
  question: z.string().trim().min(5).max(200),
  answer: z.string().trim().min(5).max(1200),
});
export type GeoFaqItem = z.infer<typeof GeoFaqItemSchema>;
export const GeoFaqSchema = z.array(GeoFaqItemSchema).max(15);

/** O que a IA devolve ao gerar as perguntas frequentes. */
export const GeoFaqDraftSchema = z.object({
  // Sem limites no esquema (a saída estruturada não aceita todos): corta-se depois.
  perguntas: z.array(z.object({ pergunta: z.string(), resposta: z.string() })),
});

export const GEO_FAQ_SYSTEM_PROMPT = `És copywriter de SEO e GEO (otimização para motores de pesquisa e para assistentes de IA) em Portugal.
Escreves as perguntas frequentes da página de um negócio local, em português de Portugal.
Regras:
- 8 a 10 perguntas que um cliente real faria antes de contratar ou comprar (preço, prazos, zona servida, como funciona, garantias, marcações, pagamentos…).
- Cada resposta com 2 a 4 frases, direta e útil, a mencionar o nome do negócio e a zona quando fizer sentido (é isto que as IAs citam).
- Não inventes factos concretos que não te deram (preços, anos de experiência, prémios, certificações, horários): escreve de forma geral ou convida a pedir orçamento/contactar.
- Tom profissional e próximo, sem exageros nem emojis.`;

export function buildFaqPrompt(input: { name: string; type: string; city: string | null; services: string[]; description: string | null; website: string | null }): string {
  return [
    `Negócio: ${input.name}`,
    `Tipo: ${SCHEMA_BUSINESS_TYPES.find((t) => t.value === input.type)?.label ?? input.type}`,
    input.city ? `Zona: ${input.city}` : null,
    input.services.length ? `Serviços/produtos: ${input.services.join(', ')}` : null,
    input.description ? `Sobre o negócio: ${input.description}` : null,
    input.website ? `Site: ${input.website}` : null,
    '',
    'Escreve as perguntas frequentes.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function buildFaqJsonLd(items: GeoFaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.question, acceptedAnswer: { '@type': 'Answer', text: i.answer } })),
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML simples (acordeão nativo <details>), pronto a colar no site (Bricks: elemento "Código"). */
export function buildFaqHtml(items: GeoFaqItem[]): string {
  const blocks = items
    .map((i) => `  <details class="faq-item">\n    <summary>${escapeHtml(i.question)}</summary>\n    <p>${escapeHtml(i.answer)}</p>\n  </details>`)
    .join('\n');
  return `<section class="faq">\n  <h2>Perguntas frequentes</h2>\n${blocks}\n</section>`;
}

// -----------------------------------------------------------------------------
// llms.txt
// -----------------------------------------------------------------------------

/** llms.txt (proposta llmstxt.org): resumo do negócio em Markdown, na raiz do site. */
export function buildLlmsTxt(b: GeoBusiness, faq: GeoFaqItem[] = []): string {
  const lines: string[] = [`# ${b.name}`, ''];
  lines.push(`> ${b.description?.trim() || `${SCHEMA_BUSINESS_TYPES.find((t) => t.value === b.type)?.label ?? 'Negócio'}${b.city ? ` em ${b.city}` : ''}.`}`, '');
  const contact = [
    b.phone ? `- Telefone: ${b.phone}` : null,
    b.email ? `- Email: ${b.email}` : null,
    b.street || b.city ? `- Morada: ${[b.street, [b.postal_code, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}` : null,
    b.area_served ? `- Zona servida: ${b.area_served}` : null,
    b.opening_hours.length ? `- Horário: ${b.opening_hours.join('; ')}` : null,
    b.url ? `- Site: ${b.url}` : null,
  ].filter((l): l is string => !!l);
  if (contact.length) lines.push('## Contactos', '', ...contact, '');
  if (b.services.length) lines.push('## Serviços', '', ...b.services.map((s) => `- ${s}`), '');
  if (b.same_as.length) lines.push('## Perfis', '', ...b.same_as.map((u) => `- ${u}`), '');
  if (faq.length) {
    lines.push('## Perguntas frequentes', '');
    for (const f of faq) lines.push(`### ${f.question}`, '', f.answer, '');
  }
  return `${lines.join('\n').trim()}\n`;
}

// -----------------------------------------------------------------------------
// Perfil do Google (nota e avaliações)
// -----------------------------------------------------------------------------

export const GoogleProfileSchema = z.object({
  name: z.string(),
  found: z.boolean(),
  rating: z.number().nullable(),
  reviews: z.int().nullable(),
  maps_url: z.string().nullable(),
  address: z.string().nullable(),
});
export type GoogleProfile = z.infer<typeof GoogleProfileSchema>;

export const GoogleCheckSchema = z
  .object({
    /** places = Google Places API (exato); ia = pesquisa da IA (aproximado). */
    source: z.enum(['places', 'ia']),
    checked_at: z.string(),
    lead: GoogleProfileSchema,
    competitors: z.array(GoogleProfileSchema),
  })
  .meta({ id: 'GoogleCheck' });
export type GoogleCheck = z.infer<typeof GoogleCheckSchema>;

/** Frase de comparação para o cliente ("4,2★ com 18 avaliações; os concorrentes têm em média 4,7★ e 120"). */
export function googleComparison(check: Pick<GoogleCheck, 'lead' | 'competitors'>): string | null {
  const fmt = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 1 });
  const rated = check.competitors.filter((c) => c.found && c.rating !== null);
  if (!check.lead.found) {
    return rated.length
      ? `A sua empresa não aparece no Google Maps; os concorrentes têm em média ${fmt(avg(rated.map((c) => c.rating!)))}★ e ${Math.round(avg(rated.map((c) => c.reviews ?? 0)))} avaliações.`
      : 'A sua empresa não aparece no Google Maps.';
  }
  const mine = check.lead.rating !== null ? `${fmt(check.lead.rating)}★ com ${check.lead.reviews ?? 0} avaliações` : 'sem avaliações';
  if (!rated.length) return `No Google Maps, a sua empresa tem ${mine}.`;
  return `No Google Maps, a sua empresa tem ${mine}; os concorrentes que as IAs recomendam têm em média ${fmt(avg(rated.map((c) => c.rating!)))}★ e ${Math.round(avg(rated.map((c) => c.reviews ?? 0)))} avaliações.`;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const GOOGLE_CHECK_TOOL_NAME = 'entregar_perfis';

const nullableNumber = { type: ['number', 'null'] } as const;
const nullableStr = { type: ['string', 'null'] } as const;

export const GOOGLE_CHECK_TOOL = {
  name: GOOGLE_CHECK_TOOL_NAME,
  description: 'Entrega o perfil do Google de cada empresa pedida, pela mesma ordem. Chama esta ferramenta uma única vez, no fim.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['perfis'],
    properties: {
      perfis: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['nome', 'encontrado', 'nota', 'avaliacoes', 'link_maps', 'morada'],
          properties: {
            nome: { type: 'string', description: 'Nome da empresa, tal como foi pedido' },
            encontrado: { type: 'boolean', description: 'Encontraste o perfil desta empresa no Google (Maps / Perfil da Empresa)?' },
            nota: { ...nullableNumber, description: 'Nota média de 1 a 5 (ex.: 4.6)' },
            avaliacoes: { ...nullableNumber, description: 'Número de avaliações' },
            link_maps: { ...nullableStr, description: 'Link do Google Maps, se o encontraste' },
            morada: { ...nullableStr, description: 'Morada no perfil' },
          },
        },
      },
    },
  },
} as const;

export const GOOGLE_CHECK_SYSTEM_PROMPT = `Procuras perfis de empresas no Google Maps (Perfil da Empresa no Google) em Portugal.
Para cada empresa pedida, pesquisa e indica se tem perfil, a nota média, o número de avaliações, o link do Maps e a morada.
Usa só o que encontrares nas pesquisas; se não tiveres certeza de que é a mesma empresa, indica encontrado = false. Não inventes números.
No fim, chama a ferramenta ${GOOGLE_CHECK_TOOL_NAME} uma única vez, com um perfil por empresa, pela mesma ordem.`;

export const GOOGLE_CHECK_JSON_SYSTEM_PROMPT = `Procuras perfis de empresas no Google Maps (Perfil da Empresa no Google) em Portugal.
Para cada empresa pedida, pesquisa e indica se tem perfil, a nota média, o número de avaliações, o link do Maps e a morada.
Usa só o que encontrares; se não tiveres certeza de que é a mesma empresa, encontrado = false. Não inventes números.
Responde só com {"perfis":[{"nome":"…","encontrado":true,"nota":4.6,"avaliacoes":120,"link_maps":"…","morada":"…"}]}, sem texto à volta.`;

export function buildGoogleCheckPrompt(companies: { name: string; city: string | null; website?: string | null }[]): string {
  return `Empresas:\n${companies.map((c, i) => `${i + 1}. ${c.name}${c.city ? ` (${c.city})` : ''}${c.website ? ` — ${c.website}` : ''}`).join('\n')}`;
}

/** Lê a resposta da IA (pela ordem pedida). */
export function parseGoogleProfiles(raw: unknown, names: string[]): GoogleProfile[] {
  const list = (raw as { perfis?: unknown } | null)?.perfis;
  const items = Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return names.map((name, i) => {
    const it = items[i] ?? {};
    const rating = num(it.nota);
    const reviews = num(it.avaliacoes);
    const found = it.encontrado === true;
    return {
      name,
      found,
      rating: found && rating !== null && rating >= 1 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
      reviews: found && reviews !== null && reviews >= 0 ? Math.round(reviews) : null,
      maps_url: found ? str(it.link_maps) : null,
      address: found ? str(it.morada) : null,
    };
  });
}

// -----------------------------------------------------------------------------
// O kit guardado de um lead
// -----------------------------------------------------------------------------

export const LeadGeoSchema = z
  .object({
    business: GeoBusinessSchema,
    /** false = ainda não foi guardado (são as sugestões a partir da ficha). */
    business_saved: z.boolean(),
    faq: GeoFaqSchema,
    faq_generated_at: z.string().nullable(),
    google: GoogleCheckSchema.nullable(),
  })
  .meta({ id: 'LeadGeo' });
export type LeadGeo = z.infer<typeof LeadGeoSchema>;

export const LeadGeoUpdateSchema = z
  .object({ business: GeoBusinessSchema.optional(), faq: GeoFaqSchema.optional() })
  .meta({ id: 'LeadGeoUpdate' });
