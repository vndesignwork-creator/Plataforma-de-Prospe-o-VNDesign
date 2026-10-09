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
] as const;
export type AuditIssueCode = (typeof AUDIT_ISSUE_CODES)[number];

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

  const order: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  let mobile: MobileStatus = 'desconhecido';
  if (html) {
    if (!html.has_viewport) mobile = 'nao';
    else if (score !== null && score < 50) mobile = 'parcial';
    else mobile = 'sim';
  }

  return {
    issues,
    suggested_problems: issues.length ? issues.map((i) => i.short).join('; ') : null,
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
