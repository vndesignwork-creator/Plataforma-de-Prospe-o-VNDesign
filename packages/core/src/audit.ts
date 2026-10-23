/**
 * Auditor de sites — a parte "pura" (sem rede): ler o HTML, interpretar a
 * resposta do PageSpeed Insights e transformar os resultados em problemas
 * prontos para a coluna "Problemas" da folha. A recolha (HTTP, TLS, PageSpeed)
 * é feita no servidor da web.
 */
import { z } from 'zod';
import { MOBILE_STATUSES, type MobileStatus } from './enums';
import { isSocialOrDirectoryUrl } from './links';

export { isSocialOrDirectoryUrl };

// -----------------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------------
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', ndash: '–', mdash: '—',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à', acirc: 'â', ecirc: 'ê',
  ocirc: 'ô', atilde: 'ã', otilde: 'õ', ccedil: 'ç', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó',
  Uacute: 'Ú', Agrave: 'À', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

const clean = (s: string | undefined | null) => {
  const v = decodeHtmlEntities(s ?? '').replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
};

/** Atributos de uma tag HTML (nomes em minúsculas). */
function tagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const inner = tag.replace(/^<\s*[a-zA-Z]+/, '').replace(/\/?>$/, '');
  for (const m of inner.matchAll(re)) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

export interface HtmlFacts {
  title: string | null;
  meta_description: string | null;
  has_viewport: boolean;
  zoom_blocked: boolean;
  cms: string | null;
  copyright_year: number | null;
}

const CMS_MARKERS: [RegExp, string][] = [
  [/wp-content\/|wp-includes\//i, 'WordPress'],
  [/static\.wixstatic\.com|wix\.com\/|_wixCIDX|wix-warmup-data/i, 'Wix'],
  [/cdn\.shopify\.com|Shopify\.theme/i, 'Shopify'],
  [/squarespace\.com|static1\.squarespace/i, 'Squarespace'],
  [/data-wf-page|webflow\.com/i, 'Webflow'],
  [/\/media\/jui\/|\/components\/com_|Joomla!/i, 'Joomla'],
  [/\/sites\/default\/files\/|Drupal\.settings/i, 'Drupal'],
  [/prestashop/i, 'PrestaShop'],
  [/sites\.google\.com|gstatic\.com\/sites/i, 'Google Sites'],
  [/godaddy|img1\.wsimg\.com/i, 'GoDaddy Website Builder'],
  [/jimdo/i, 'Jimdo'],
];

function detectCms(html: string, generator: string | null): string | null {
  if (generator) {
    const g = generator.toLowerCase();
    const known = ['WordPress', 'Joomla', 'Drupal', 'Wix', 'Squarespace', 'Webflow', 'PrestaShop', 'Shopify', 'Jimdo'];
    const hit = known.find((k) => g.includes(k.toLowerCase()));
    if (hit) {
      // Mantém a versão do WordPress/Joomla quando vem no "generator" (versões antigas = argumento de venda).
      const version = generator.match(/\d+(?:\.\d+){0,2}/)?.[0];
      return version && (hit === 'WordPress' || hit === 'Joomla' || hit === 'Drupal') ? `${hit} ${version}` : hit;
    }
  }
  for (const [re, name] of CMS_MARKERS) if (re.test(html)) return name;
  return null;
}

/** Ano de copyright mais recente encontrado na página ("© 2019", "Copyright 2015-2021"). */
function detectCopyrightYear(text: string, currentYear: number): number | null {
  let best: number | null = null;
  const re = /(?:©|\(c\)|copyright|todos os direitos reservados)[^0-9]{0,40}?((?:19|20)\d{2})(?:\s*[-–—/]\s*((?:19|20)\d{2}))?/gi;
  for (const m of text.matchAll(re)) {
    const year = Number(m[2] ?? m[1]);
    if (year >= 1995 && year <= currentYear && (best === null || year > best)) best = year;
  }
  return best;
}

/** Lê os dados relevantes do HTML de uma página. */
export function analyzeHtml(html: string, now: Date = new Date()): HtmlFacts {
  const head = html.slice(0, 300_000);
  const title = clean(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);

  let metaDescription: string | null = null;
  let viewport: string | null = null;
  let generator: string | null = null;
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = tagAttributes(m[0]);
    const name = (a.name ?? a.property ?? '').toLowerCase();
    if (name === 'description' && metaDescription === null) metaDescription = clean(a.content);
    if (name === 'og:description' && metaDescription === null) metaDescription = clean(a.content);
    if (name === 'viewport') viewport = (a.content ?? '').toLowerCase();
    if (name === 'generator' && generator === null) generator = clean(a.content);
  }

  const hasViewport = viewport !== null && /width\s*=\s*device-width/.test(viewport);
  let zoomBlocked = false;
  if (viewport !== null) {
    const scalable = viewport.match(/user-scalable\s*=\s*([a-z0-9.]+)/)?.[1];
    const maxScale = Number(viewport.match(/maximum-scale\s*=\s*([0-9.]+)/)?.[1] ?? NaN);
    zoomBlocked = scalable === 'no' || scalable === '0' || (Number.isFinite(maxScale) && maxScale <= 1);
  }

  // Texto visível aproximado (sem scripts/estilos) para o ano do copyright.
  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );

  return {
    title,
    meta_description: metaDescription,
    has_viewport: hasViewport,
    zoom_blocked: zoomBlocked,
    cms: detectCms(html, generator),
    copyright_year: detectCopyrightYear(text, now.getFullYear()),
  };
}

// -----------------------------------------------------------------------------
// GEO: o site está preparado para as IAs (ChatGPT, Claude, Perplexity, Gemini)?
// -----------------------------------------------------------------------------
/** Robôs das IAs que importam para aparecer nas respostas (nome no robots.txt → nome a mostrar). */
export const AI_CRAWLERS: { agent: string; label: string; search: boolean }[] = [
  { agent: 'GPTBot', label: 'GPTBot (ChatGPT)', search: true },
  { agent: 'OAI-SearchBot', label: 'OAI-SearchBot (ChatGPT)', search: true },
  { agent: 'ChatGPT-User', label: 'ChatGPT-User', search: true },
  { agent: 'ClaudeBot', label: 'ClaudeBot (Claude)', search: true },
  { agent: 'Claude-SearchBot', label: 'Claude-SearchBot', search: true },
  { agent: 'Claude-User', label: 'Claude-User', search: true },
  { agent: 'PerplexityBot', label: 'PerplexityBot', search: true },
  // Só treino do Gemini: bloquear é uma escolha comum, não conta como problema.
  { agent: 'Google-Extended', label: 'Google-Extended (Gemini)', search: false },
];

export interface GeoFacts {
  /** Tipos schema.org encontrados (JSON-LD e microdata). */
  structured_types: string[];
  /** Dados estruturados do negócio (LocalBusiness, Organization ou parecido). */
  business_schema: boolean;
  faq: boolean;
  word_count: number;
  phone: boolean;
  address: boolean;
  maps_link: boolean;
  /** Robôs das IAs bloqueados no robots.txt (null = não foi possível ler o robots.txt). */
  ai_bots_blocked: string[] | null;
}

const BUSINESS_TYPE =
  /business|organi[sz]ation|corporation|service|store|shop|restaurant|cafe|bakery|bar\b|hotel|lodging|clinic|dentist|physician|medical|attorney|legal|accounting|agency|contractor|plumber|electrician|roofing|realestate|autorepair|autodealer|gym|spa|salon|beauty|school|educational/i;

/** Tipos @type de um bloco JSON-LD (inclui @graph e objetos aninhados). */
function jsonLdTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) jsonLdTypes(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  for (const t of Array.isArray(type) ? type : [type]) if (typeof t === 'string' && t.trim()) out.add(t.trim().replace(/^https?:\/\/schema\.org\//i, ''));
  for (const value of Object.values(obj)) if (value && typeof value === 'object') jsonLdTypes(value, out, depth + 1);
}

/** Texto visível aproximado de uma página (sem scripts, estilos nem etiquetas). */
function visibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
}

/** O que a página mostra às IAs: dados estruturados, conteúdo, contactos, FAQ e mapa. */
export function analyzeGeoHtml(html: string): Omit<GeoFacts, 'ai_bots_blocked'> {
  const types = new Set<string>();
  let structuredAddress = false;
  let structuredPhone = false;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(m[1]!.trim());
      jsonLdTypes(data, types);
      const raw = m[1]!;
      if (/"(?:address|streetAddress)"/i.test(raw)) structuredAddress = true;
      if (/"telephone"/i.test(raw)) structuredPhone = true;
    } catch {
      // JSON-LD inválido: ignora-se (as IAs também o ignoram).
    }
  }
  for (const m of html.matchAll(/itemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) types.add(m[1]!);

  const text = visibleText(html);
  const words = text.match(/[\p{L}\p{N}]{2,}/gu)?.length ?? 0;
  const list = [...types].slice(0, 20);
  return {
    structured_types: list,
    business_schema: list.some((t) => BUSINESS_TYPE.test(t)),
    faq: types.has('FAQPage') || /perguntas frequentes|d[úu]vidas frequentes|\bFAQs?\b/i.test(text),
    word_count: words,
    phone: structuredPhone || /href\s*=\s*["']tel:/i.test(html) || /(?:\+351[\s.]?)?\b(?:2\d{2}|9[1236]\d)[\s.]?\d{3}[\s.]?\d{3}\b/.test(text),
    address: structuredAddress || /<address\b/i.test(html) || /\b\d{4}\s?-\s?\d{3}\b/.test(text),
    maps_link: /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page\/|g\.co\/kgs/i.test(html),
  };
}

/**
 * Robôs das IAs (AI_CRAWLERS) que o robots.txt impede de ler o site inteiro.
 * Cada robô segue o grupo com o seu nome; sem grupo próprio, segue o "*".
 */
export function aiBotsBlockedByRobots(robots: string): string[] {
  type Group = { agents: string[]; disallowAll: boolean; allowAll: boolean };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false, allowAll: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'disallow' && (value === '/' || value === '/*')) current.disallowAll = true;
    if (key === 'allow' && (value === '/' || value === '/*')) current.allowAll = true;
  }
  const blocked = (g: Group) => g.disallowAll && !g.allowAll;
  return AI_CRAWLERS.filter(({ agent }) => {
    const own = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
    const rules = own.length ? own : groups.filter((g) => g.agents.includes('*'));
    return rules.some(blocked);
  }).map((c) => c.agent);
}

/** Pontos verificados para as IAs (para o resumo "x de y"). */
export function geoChecklist(geo: GeoFacts): { key: string; ok: boolean; label: string }[] {
  const searchBlocked = (geo.ai_bots_blocked ?? []).filter((a) => AI_CRAWLERS.find((c) => c.agent === a)?.search);
  return [
    ...(geo.ai_bots_blocked === null
      ? []
      : [{ key: 'bots', ok: !searchBlocked.length, label: searchBlocked.length ? `Bloqueia as IAs: ${searchBlocked.join(', ')}` : 'Deixa as IAs lerem o site (robots.txt)' }]),
    { key: 'schema', ok: geo.business_schema, label: geo.business_schema ? 'Dados estruturados do negócio (schema.org)' : 'Sem dados estruturados do negócio (schema.org)' },
    { key: 'content', ok: geo.word_count >= 300, label: `${geo.word_count.toLocaleString('pt-PT')} palavras na página inicial` },
    { key: 'contacts', ok: geo.phone || geo.address, label: geo.phone && geo.address ? 'Telefone e morada visíveis' : geo.phone ? 'Telefone visível (sem morada)' : geo.address ? 'Morada visível (sem telefone)' : 'Sem telefone nem morada visíveis' },
    { key: 'faq', ok: geo.faq, label: geo.faq ? 'Tem perguntas frequentes' : 'Sem perguntas frequentes' },
    { key: 'maps', ok: geo.maps_link, label: geo.maps_link ? 'Ligação ao Google Maps' : 'Sem ligação ao Google Maps' },
  ];
}

// -----------------------------------------------------------------------------
// PageSpeed Insights (API v5)
// -----------------------------------------------------------------------------
export interface PageSpeedResult {
  score: number | null;
  metrics: { lcp_ms?: number; fcp_ms?: number; tbt_ms?: number; cls?: number; si_ms?: number };
}

/** Extrai a pontuação (0–100) e as métricas principais da resposta do PageSpeed. */
export function parsePageSpeedResponse(json: unknown): PageSpeedResult {
  const lh = (json as { lighthouseResult?: Record<string, unknown> } | null)?.lighthouseResult as
    | { categories?: { performance?: { score?: number | null } }; audits?: Record<string, { numericValue?: number }> }
    | undefined;
  const raw = lh?.categories?.performance?.score;
  const audits = lh?.audits ?? {};
  const num = (key: string) => {
    const v = audits[key]?.numericValue;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const metrics: PageSpeedResult['metrics'] = {};
  const lcp = num('largest-contentful-paint');
  const fcp = num('first-contentful-paint');
  const tbt = num('total-blocking-time');
  const cls = num('cumulative-layout-shift');
  const si = num('speed-index');
  if (lcp !== undefined) metrics.lcp_ms = Math.round(lcp);
  if (fcp !== undefined) metrics.fcp_ms = Math.round(fcp);
  if (tbt !== undefined) metrics.tbt_ms = Math.round(tbt);
  if (cls !== undefined) metrics.cls = Math.round(cls * 1000) / 1000;
  if (si !== undefined) metrics.si_ms = Math.round(si);
  return { score: typeof raw === 'number' ? Math.round(raw * 100) : null, metrics };
}

// -----------------------------------------------------------------------------
// Problemas encontrados
// -----------------------------------------------------------------------------
export const AUDIT_ISSUE_CODES = [
  'no_own_site',
  'unreachable',
  'http_error',
  'no_https',
  'ssl_invalid',
  'ssl_expiring',
  'no_viewport',
  'zoom_blocked',
  'pagespeed_low',
  'pagespeed_medium',
  'slow_lcp',
  'slow_response',
  'no_title',
  'no_meta_description',
  'outdated_copyright',
  // GEO (preparado para as IAs)
  'ai_bots_blocked',
  'no_structured_data',
  'thin_content',
  'no_contact_info',
  'no_faq',
  'no_maps_link',
] as const;
export type AuditIssueCode = (typeof AUDIT_ISSUE_CODES)[number];
/** Problemas da parte GEO (preparado para as IAs). */
export const GEO_ISSUE_CODES: ReadonlySet<AuditIssueCode> = new Set(['ai_bots_blocked', 'no_structured_data', 'thin_content', 'no_contact_info', 'no_faq', 'no_maps_link']);
/** Detalhes que aparecem no diagnóstico mas não entram na coluna "Problemas" do lead. */
const NOT_IN_PROBLEMS: ReadonlySet<AuditIssueCode> = new Set(['no_faq', 'no_maps_link']);

export const AUDIT_SEVERITIES = ['high', 'medium', 'low'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];
export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = { high: 'Grave', medium: 'Médio', low: 'Menor' };

export interface AuditIssue {
  code: AuditIssueCode;
  severity: AuditSeverity;
  /** Frase completa para o ecrã. */
  message: string;
  /** Versão curta para a coluna "Problemas". */
  short: string;
}

/** Tudo o que a recolha conseguiu apurar (campos em falta = não verificado). */
export interface AuditFacts {
  own_site: boolean;
  reachable: boolean;
  http_status?: number | null;
  response_ms?: number | null;
  https?: boolean | null;
  ssl_valid?: boolean | null;
  ssl_expires_at?: string | null;
  html?: HtmlFacts | null;
  pagespeed?: PageSpeedResult | null;
  geo?: GeoFacts | null;
}

const seconds = (ms: number) => `${(ms / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} s`;

/** Converte os factos recolhidos em problemas, texto sugerido e estado "Mobile?". */
export function buildAuditFindings(
  facts: AuditFacts,
  now: Date = new Date(),
): { issues: AuditIssue[]; suggested_problems: string | null; suggested_mobile: MobileStatus } {
  const issues: AuditIssue[] = [];
  const add = (code: AuditIssueCode, severity: AuditSeverity, message: string, short: string) =>
    issues.push({ code, severity, message, short });

  if (!facts.own_site) {
    add('no_own_site', 'high', 'Não tem site próprio — só redes sociais ou diretórios.', 'Sem site próprio (só redes sociais)');
    return { issues, suggested_problems: issues.map((i) => i.short).join('; '), suggested_mobile: 'desconhecido' };
  }
  if (!facts.reachable) {
    add('unreachable', 'high', 'O site não abre (não respondeu ou o domínio não existe).', 'Site inacessível');
    return { issues, suggested_problems: issues.map((i) => i.short).join('; '), suggested_mobile: 'desconhecido' };
  }
  if (facts.http_status && facts.http_status >= 400) {
    add('http_error', 'high', `O site responde com erro HTTP ${facts.http_status}.`, `Erro ${facts.http_status} ao abrir`);
  }

  if (facts.https === false) {
    add('no_https', 'high', 'Não usa HTTPS — o browser mostra «Não seguro».', 'Sem HTTPS');
  } else if (facts.ssl_valid === false) {
    add('ssl_invalid', 'high', 'O certificado SSL é inválido ou expirou — o browser mostra um aviso de segurança.', 'Certificado SSL inválido');
  } else if (facts.ssl_valid && facts.ssl_expires_at) {
    const days = Math.floor((new Date(facts.ssl_expires_at).getTime() - now.getTime()) / 86_400_000);
    if (days >= 0 && days <= 14) {
      add('ssl_expiring', 'medium', `O certificado SSL expira dentro de ${days} dia${days === 1 ? '' : 's'}.`, 'SSL a expirar');
    }
  }

  const html = facts.html;
  if (html) {
    if (!html.has_viewport) {
      add('no_viewport', 'high', 'Não está adaptado a telemóvel (falta a meta tag viewport).', 'Não é responsivo');
    } else if (html.zoom_blocked) {
      add('zoom_blocked', 'low', 'Impede o zoom no telemóvel (problema de acessibilidade).', 'Bloqueia o zoom');
    }
  }

  const score = facts.pagespeed?.score ?? null;
  if (score !== null) {
    if (score < 50) add('pagespeed_low', 'high', `PageSpeed mobile baixo: ${score}/100.`, `PageSpeed ${score}`);
    else if (score < 90) add('pagespeed_medium', 'medium', `PageSpeed mobile a melhorar: ${score}/100.`, `PageSpeed ${score}`);
  }
  const lcp = facts.pagespeed?.metrics.lcp_ms;
  if (lcp !== undefined && lcp > 4000) {
    add('slow_lcp', score !== null && score < 50 ? 'medium' : 'high', `Demora ${seconds(lcp)} a mostrar o conteúdo principal (LCP).`, `Carrega em ${seconds(lcp)}`);
  } else if (facts.response_ms && facts.response_ms > 3000) {
    add('slow_response', 'medium', `O servidor demora ${seconds(facts.response_ms)} a responder.`, 'Servidor lento');
  }

  if (html) {
    if (!html.title) add('no_title', 'medium', 'A página não tem título (mau para o Google).', 'Sem título');
    if (!html.meta_description) {
      add('no_meta_description', 'medium', 'Sem meta descrição — o Google escolhe um texto qualquer.', 'Sem meta descrição');
    }
    const year = html.copyright_year;
    if (year !== null && year < now.getFullYear() - 1) {
      add('outdated_copyright', 'medium', `O rodapé diz © ${year} — o site parece não ter manutenção.`, `Copyright de ${year}`);
    }
  }

  const geo = facts.geo;
  if (html && geo) {
    const searchBlocked = (geo.ai_bots_blocked ?? []).filter((a) => AI_CRAWLERS.find((c) => c.agent === a)?.search);
    if (searchBlocked.length) {
      add('ai_bots_blocked', 'high', `O robots.txt bloqueia as IAs (${searchBlocked.join(', ')}): o ChatGPT, o Claude ou o Perplexity não leem o site.`, 'Bloqueia as IAs');
    }
    if (!geo.business_schema) {
      add('no_structured_data', 'medium', 'Sem dados estruturados do negócio (schema.org): as IAs e o Google percebem pior quem são, onde ficam e o que fazem.', 'Sem dados estruturados');
    }
    if (geo.word_count < 300) {
      add('thin_content', 'medium', `Pouco texto na página inicial (${geo.word_count} palavras): as IAs têm pouco para citar.`, 'Pouco conteúdo');
    }
    if (!geo.phone && !geo.address) add('no_contact_info', 'medium', 'Não mostra telefone nem morada na página inicial.', 'Sem contactos visíveis');
    if (!geo.faq) add('no_faq', 'low', 'Sem perguntas frequentes — é o tipo de conteúdo que as IAs mais citam.', 'Sem FAQ');
    if (!geo.maps_link) add('no_maps_link', 'low', 'Sem ligação ao Google Maps nem ao perfil do Google.', 'Sem ligação ao Maps');
  }

  const order: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  let mobile: MobileStatus = 'desconhecido';
  if (html) {
    if (!html.has_viewport) mobile = 'nao';
    else if (score !== null && score < 50) mobile = 'parcial';
    else mobile = 'sim';
  }

  const forProblems = issues.filter((i) => !NOT_IN_PROBLEMS.has(i.code));
  return {
    issues,
    suggested_problems: forProblems.length ? forProblems.map((i) => i.short).join('; ') : null,
    suggested_mobile: mobile,
  };
}

// -----------------------------------------------------------------------------
// Schemas da API
// -----------------------------------------------------------------------------
export const AuditIssueSchema = z.object({
  code: z.enum(AUDIT_ISSUE_CODES),
  severity: z.enum(AUDIT_SEVERITIES),
  message: z.string(),
  short: z.string(),
});

export const SCREENSHOT_DEVICES = ['mobile', 'desktop'] as const;
export type ScreenshotDevice = (typeof SCREENSHOT_DEVICES)[number];
export const SCREENSHOT_DEVICE_LABELS: Record<ScreenshotDevice, string> = { mobile: 'Telemóvel', desktop: 'Computador' };

export const SiteScreenshotSchema = z
  .object({
    device: z.enum(SCREENSHOT_DEVICES),
    width: z.int().nullable(),
    height: z.int().nullable(),
    url: z.string().meta({ description: 'Imagem (redireciona para um link temporário)' }),
  })
  .meta({ id: 'SiteScreenshot' });
export type SiteScreenshot = z.infer<typeof SiteScreenshotSchema>;

/** Imagem "final-screenshot" de uma resposta do PageSpeed (data URI em JPEG). */
export function pageSpeedScreenshot(json: unknown): { data: string; width: number | null; height: number | null } | null {
  const details = (
    json as { lighthouseResult?: { audits?: Record<string, { details?: { data?: unknown; width?: unknown; height?: unknown } }> } } | null
  )?.lighthouseResult?.audits?.['final-screenshot']?.details;
  if (typeof details?.data !== 'string' || !details.data.startsWith('data:image/')) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  return { data: details.data, width: num(details.width), height: num(details.height) };
}

export const SiteAuditSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    url: z.string(),
    final_url: z.string().nullable(),
    status: z.enum(['done', 'error']),
    http_status: z.int().nullable(),
    response_ms: z.int().nullable(),
    https: z.boolean().nullable(),
    ssl_valid: z.boolean().nullable(),
    ssl_issuer: z.string().nullable(),
    ssl_expires_at: z.string().nullable(),
    ssl_error: z.string().nullable(),
    has_viewport: z.boolean().nullable(),
    zoom_blocked: z.boolean().nullable(),
    pagespeed_mobile: z.int().nullable(),
    metrics: z.record(z.string(), z.unknown()),
    title: z.string().nullable(),
    meta_description: z.string().nullable(),
    cms: z.string().nullable(),
    copyright_year: z.int().nullable(),
    issues: z.array(AuditIssueSchema),
    suggested_problems: z.string().nullable(),
    suggested_mobile: z.enum(MOBILE_STATUSES).nullable(),
    error: z.string().nullable(),
    screenshots: z.array(SiteScreenshotSchema).default([]),
    created_at: z.string(),
  })
  .meta({ id: 'SiteAudit' });
export type SiteAudit = z.infer<typeof SiteAuditSchema>;

export const SiteAuditRequestSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .meta({ description: 'Por omissão, o website do lead' }),
  })
  .meta({ id: 'SiteAuditRequest' });

export const AUDIT_APPLY_FIELDS = ['pagespeed', 'mobile', 'problems'] as const;
export const AuditApplySchema = z
  .object({
    fields: z.array(z.enum(AUDIT_APPLY_FIELDS)).min(1, 'Escolhe pelo menos um campo.'),
    problems_mode: z.enum(['replace', 'append']).default('replace'),
  })
  .meta({ id: 'AuditApply' });
export type AuditApply = z.infer<typeof AuditApplySchema>;

// -----------------------------------------------------------------------------
// Relatório de diagnóstico (PDF para o cliente)
// -----------------------------------------------------------------------------

/** Porque é que cada problema importa, em linguagem de cliente (não técnica). */
export const AUDIT_ISSUE_IMPACT: Record<AuditIssueCode, string> = {
  no_own_site: 'Quem procura no Google não encontra uma página vossa: os clientes acabam por escolher a concorrência.',
  unreachable: 'O site não abre: cada visita perdida é um cliente que nem chega a contactar.',
  http_error: 'O site devolve um erro: transmite abandono e o Google deixa de o mostrar.',
  no_https: 'O browser mostra “Não seguro” ao lado do endereço: muitos visitantes saem logo e o Google penaliza.',
  ssl_invalid: 'Ao abrir o site aparece um aviso de segurança, que assusta quem chega.',
  ssl_expiring: 'O certificado de segurança expira em breve; depois disso o site passa a mostrar um aviso.',
  no_viewport: 'A maioria das visitas é feita no telemóvel; sem adaptação, o texto fica minúsculo e as pessoas desistem.',
  zoom_blocked: 'Não deixa ampliar o texto no telemóvel: pior leitura, sobretudo para clientes mais velhos.',
  pagespeed_low: 'Um site lento perde visitantes: mais de metade desiste se a página demora mais de 3 segundos.',
  pagespeed_medium: 'Há margem para ficar mais rápido — e a velocidade conta para a posição no Google.',
  slow_lcp: 'O conteúdo principal demora a aparecer: a primeira impressão é de lentidão.',
  slow_response: 'O servidor demora a responder e tudo o resto fica atrasado.',
  no_title: 'Sem título, o Google mostra mal o site (ou nem o mostra) nas pesquisas.',
  no_meta_description: 'O Google escolhe um texto qualquer para mostrar nos resultados, o que reduz os cliques.',
  outdated_copyright: 'O ano no rodapé está desatualizado e passa a ideia de um site abandonado.',
  ai_bots_blocked: 'O site impede o ChatGPT e outras IAs de o lerem: quando alguém lhes pede uma recomendação, a vossa empresa fica de fora.',
  no_structured_data: 'Faltam os dados do negócio num formato que o Google e as IAs entendem (nome, morada, horário, serviços): aparecem menos nas respostas.',
  thin_content: 'A página tem pouco texto: o Google e as IAs têm pouca informação para recomendar a vossa empresa.',
  no_contact_info: 'Quem chega ao site não vê logo como contactar ou onde ficam: muitos desistem antes de ligar.',
  no_faq: 'Responder às perguntas habituais dos clientes ajuda a aparecer quando alguém pergunta ao ChatGPT ou ao Google.',
  no_maps_link: 'Sem ligação ao Google Maps, é mais difícil chegar até vocês e confirmar que o negócio é real.',
};

const SEVERITY_ORDER: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Os problemas mais importantes primeiro (graves, médios, menores), no máximo `max`. */
export function topAuditIssues<T extends { severity: AuditSeverity }>(issues: readonly T[], max = 3): T[] {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).slice(0, max);
}
