/**
 * "Analisar o meu site grátis": página pública (/analise/<código>) para pôr no teu site.
 * O visitante escreve o site e o email; entra como lead quente, o site é analisado e
 * recebe o diagnóstico em PDF por email (com o email de envio ligado).
 */
import { z } from 'zod';
import type { SiteAudit } from './audit';

export const FreeAuditSettingsSchema = z.object({
  /** Código secreto da página pública (null = desligada). */
  token: z.string().nullable().default(null),
  /** Follow-up automático N dias depois do PDF, se não responder (null = desligado). */
  follow_up_days: z.int().min(1).max(30).nullable().default(3),
  /** Cloudflare Turnstile (contra robôs): chave do site (pública). */
  turnstile_site_key: z.string().nullable().default(null),
  /** A chave secreta, cifrada (nunca sai do servidor em claro). */
  turnstile_secret: z.string().nullable().default(null),
  /** "…a1b2": para reconhecer a chave secreta sem a mostrar. */
  turnstile_secret_hint: z.string().nullable().default(null),
});
export type FreeAuditSettings = z.infer<typeof FreeAuditSettingsSchema>;
export const DEFAULT_FREE_AUDIT: FreeAuditSettings = { token: null, follow_up_days: 3, turnstile_site_key: null, turnstile_secret: null, turnstile_secret_hint: null };

/** Mudar o follow-up automático e a proteção Turnstile (vazio = tirar). */
export const FreeAuditConfigSchema = z
  .object({
    follow_up_days: z.int().min(1).max(30).nullable().optional(),
    turnstile_site_key: z.string().trim().max(100).regex(/^[\w-]*$/, { error: 'Chave inválida.' }).nullable().optional(),
    turnstile_secret: z.string().trim().max(200).nullable().optional().meta({ description: 'Só se envia para mudar; null tira-a.' }),
  })
  .meta({ id: 'FreeAuditConfig' });
export type FreeAuditConfig = z.infer<typeof FreeAuditConfigSchema>;

/** De onde veio o pedido: a página do site e a campanha (UTM). */
const short = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
export const FreeAuditSourceSchema = z
  .object({
    page: short(500),
    referrer: short(500),
    utm_source: short(100),
    utm_medium: short(100),
    utm_campaign: short(150),
    utm_term: short(150),
    utm_content: short(150),
  })
  .partial();
export type FreeAuditSource = z.infer<typeof FreeAuditSourceSchema>;

/** "Google Ads / cpc · campanha primavera · de vndesign.pt/servicos" (para a linha do tempo). */
export function freeAuditSourceLabel(source: FreeAuditSource | null | undefined): string | null {
  if (!source) return null;
  const parts: string[] = [];
  const medium = [source.utm_source, source.utm_medium].filter(Boolean).join(' / ');
  if (medium) parts.push(medium);
  if (source.utm_campaign) parts.push(`campanha ${source.utm_campaign}`);
  const page = (() => {
    try {
      return source.page ? new URL(source.page).host + new URL(source.page).pathname.replace(/\/$/, '') : null;
    } catch {
      return null;
    }
  })();
  if (page) parts.push(`na página ${page}`);
  if (!medium && source.referrer) {
    try {
      const ref = new URL(source.referrer).host;
      if (ref && (!source.page || ref !== new URL(source.page).host)) parts.push(`vindo de ${ref}`);
    } catch {
      // referrer inválido: ignora
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

/** De onde veio, numa só chave para contar (ex.: "google / cpc", "facebook.com", "direto"). */
export function freeAuditSourceKey(source: FreeAuditSource | null | undefined): string {
  if (source?.utm_source) return [source.utm_source, source.utm_medium].filter(Boolean).join(' / ').toLowerCase();
  try {
    if (source?.referrer) {
      const ref = new URL(source.referrer).host.replace(/^www\./, '');
      const own = source.page ? new URL(source.page).host.replace(/^www\./, '') : null;
      if (ref && ref !== own) return ref;
    }
  } catch {
    // ignora
  }
  return 'direto';
}

/** O resumo que o visitante vê logo no ecrã (o PDF completo segue por email). */
export const FreeAuditSummarySchema = z.object({
  speed: z.object({ score: z.int().nullable(), label: z.string(), tone: z.enum(['good', 'warn', 'bad', 'none']) }),
  mobile: z.object({ label: z.string(), tone: z.enum(['good', 'warn', 'bad', 'none']) }),
  security: z.object({ label: z.string(), tone: z.enum(['good', 'warn', 'bad', 'none']) }),
  issues: z.array(z.string()).max(3),
});
export type FreeAuditSummary = z.infer<typeof FreeAuditSummarySchema>;

export const FreeAuditStatusSchema = z
  .object({
    state: z.enum(['pending', 'done', 'failed']),
    summary: FreeAuditSummarySchema.nullable(),
  })
  .meta({ id: 'FreeAuditStatus' });
export type FreeAuditStatus = z.infer<typeof FreeAuditStatusSchema>;

export function freeAuditSummary(audit: Pick<SiteAudit, 'pagespeed_mobile' | 'has_viewport' | 'zoom_blocked' | 'suggested_mobile' | 'https' | 'ssl_valid' | 'issues'>): FreeAuditSummary {
  const ps = audit.pagespeed_mobile;
  const speed =
    ps == null
      ? { score: null, label: 'Sem medição', tone: 'none' as const }
      : { score: ps, label: ps >= 90 ? 'Rápido' : ps >= 50 ? 'Pode melhorar' : 'Lento', tone: ps >= 90 ? ('good' as const) : ps >= 50 ? ('warn' as const) : ('bad' as const) };
  const mobile =
    audit.suggested_mobile === 'sim' || (audit.has_viewport && !audit.zoom_blocked)
      ? { label: 'Adaptado ao telemóvel', tone: 'good' as const }
      : audit.suggested_mobile === 'parcial' || audit.zoom_blocked
        ? { label: 'Só em parte adaptado', tone: 'warn' as const }
        : audit.has_viewport === false || audit.suggested_mobile === 'nao'
          ? { label: 'Não adaptado ao telemóvel', tone: 'bad' as const }
          : { label: 'Sem medição', tone: 'none' as const };
  const security =
    audit.https === false
      ? { label: 'Aparece “Não seguro”', tone: 'bad' as const }
      : audit.ssl_valid === false
        ? { label: 'Certificado com problemas', tone: 'bad' as const }
        : audit.https
          ? { label: 'Seguro (cadeado)', tone: 'good' as const }
          : { label: 'Sem medição', tone: 'none' as const };
  const order = { high: 0, medium: 1, low: 2 } as const;
  const issues = [...audit.issues]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, 3)
    .map((i) => i.message || i.short);
  return { speed, mobile, security, issues };
}

export const FreeAuditToggleSchema = z
  .object({
    enabled: z.boolean(),
    rotate: z.boolean().default(false).meta({ description: 'Criar outro código (o antigo deixa de funcionar)' }),
  })
  .meta({ id: 'FreeAuditToggle' });

const site = z
  .string({ error: 'Escreva o endereço do site.' })
  .trim()
  .min(4, { error: 'Escreva o endereço do site.' })
  .max(300)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.url({ protocol: /^https?$/, error: 'Endereço inválido (ex.: www.o-meu-negocio.pt).' }))
  // Precisa de um domínio com ponto (ex.: padaria.pt); endereços locais só servem em testes (o servidor recusa-os em produção).
  // (O zod corre esta verificação mesmo quando o endereço já falhou acima: daí o try.)
  .refine((v) => {
    try {
      const host = new URL(v).hostname;
      return host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host);
    } catch {
      return false;
    }
  }, { error: 'Endereço inválido (ex.: www.o-meu-negocio.pt).', abort: true });

export const FreeAuditSubmitSchema = z
  .object({
    website: site,
    email: z.email({ error: 'Email inválido.' }).trim().max(254),
    name: z.string().trim().max(120).optional().transform((v) => v || null),
    company: z.string().trim().max(200).optional().transform((v) => v || null),
    consent: z.literal(true, { error: 'Aceite que o contactemos com a análise.' }),
    source: FreeAuditSourceSchema.optional(),
    /** Resposta do Cloudflare Turnstile (quando ligado). */
    turnstile: z.string().max(4096).optional(),
  })
  .meta({ id: 'FreeAuditSubmit' });
export type FreeAuditSubmit = z.output<typeof FreeAuditSubmitSchema>;

/** O follow-up automático (N dias depois do PDF, se não respondeu), na mesma conversa. */
export function freeAuditFollowUpEmail(input: { name: string | null; host: string }): { body: string } {
  const first = input.name?.trim().split(/\s+/)[0];
  return {
    body: [
      first ? `Olá ${first},` : 'Olá,',
      '',
      `Teve oportunidade de ver a análise do site ${input.host}?`,
      '',
      'Se quiser, explico-lhe numa chamada de 10 minutos o que mais está a afastar clientes e o que faria primeiro. Basta responder com a melhor altura para si.',
      '',
      'Cumprimentos,',
    ].join('\n'),
  };
}

/** O email com o diagnóstico em anexo. */
export function freeAuditEmail(input: { name: string | null; company: string; host: string; sender: string | null }): { subject: string; body: string } {
  const first = input.name?.trim().split(/\s+/)[0];
  return {
    subject: `A análise do site ${input.host}`,
    body: [
      first ? `Olá ${first},` : 'Olá,',
      '',
      `Obrigado pelo pedido! Segue em anexo a análise do site ${input.host}: a velocidade no telemóvel, a segurança (o "Não seguro"), como aparece no Google e o que pode estar a afastar clientes.`,
      '',
      'Se quiser, explico-lhe os pontos principais numa chamada de 10 minutos, sem compromisso. Basta responder a este email com a melhor altura para si.',
      '',
      'Cumprimentos,',
    ].join('\n'),
  };
}

/** HTML para pôr no site: o botão (link) e a página dentro do site (iframe). */
/** O texto de persuasão ao lado do formulário (o mesmo do plugin de WordPress). */
export const FREE_AUDIT_PROMO = {
  eyebrow: 'Análise gratuita · Sem compromisso',
  title: 'O seu site está a afastar clientes sem dar por isso?',
  text: 'Um site lento, com o aviso “Não seguro” ou difícil de encontrar no Google e nas IAs faz perder pedidos todos os dias. Em poucos minutos mostramos-lhe o que está a correr mal e como resolver.',
  points: [
    'Velocidade no telemóvel: quanto tempo os clientes esperam',
    'Segurança: se aparece o aviso “Não seguro”',
    'Google: como o seu negócio aparece nas pesquisas',
    'IA: se o ChatGPT, o Gemini e outras IAs encontram e recomendam o seu negócio',
    'Os pormenores que levam os visitantes a desistir',
  ],
  note: 'Recebe o relatório em PDF no seu email, em linguagem simples. Sem custos e sem compromisso.',
  imageAlt: 'Exemplo do relatório da análise do site',
} as const;

export type FreeAuditLayout = {
  /** Mostrar o texto de persuasão ao lado do formulário. */
  promo: boolean;
  /** De que lado fica o texto (o formulário fica do outro). */
  side: 'right' | 'left';
};
export const DEFAULT_FREE_AUDIT_LAYOUT: FreeAuditLayout = { promo: true, side: 'left' };

/** O endereço da página com as escolhas (?texto=0, ?lado=direita, ?embed=1). De origem: texto à esquerda. */
export function freeAuditPageUrl(url: string, layout: FreeAuditLayout = DEFAULT_FREE_AUDIT_LAYOUT, embed = false): string {
  const q = new URLSearchParams();
  if (embed) q.set('embed', '1');
  if (!layout.promo) q.set('texto', '0');
  else if (layout.side === 'right') q.set('lado', 'direita');
  const qs = q.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Lê as escolhas do endereço da página. */
export function freeAuditLayoutFrom(params: { texto?: string; lado?: string }): FreeAuditLayout {
  return { promo: params.texto !== '0', side: params.lado === 'direita' ? 'right' : 'left' };
}

/**
 * O HTML para pôr no site sem o plugin: um botão que abre a página, ou a página dentro do
 * site (moldura que cresce sozinha à altura do conteúdo).
 */
export function freeAuditSnippets(url: string, layout: FreeAuditLayout = DEFAULT_FREE_AUDIT_LAYOUT): { button: string; iframe: string } {
  const origin = new URL(url).origin;
  const height = layout.promo ? 760 : 680;
  return {
    button: `<a href="${freeAuditPageUrl(url, layout)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#ef5c32;color:#0d0d0d;font-weight:600;text-decoration:none">Analisar o meu site grátis</a>`,
    iframe:
      `<iframe id="vnd-analise-gratis" src="${freeAuditPageUrl(url, layout, true)}" title="Analisar o meu site grátis" style="display:block;width:100%;height:${height}px;border:0" loading="lazy"></iframe>\n` +
      `<script>addEventListener("message",function(e){if(e.origin==="${origin}"&&e.data&&e.data.type==="vnd-fa-height"){var f=document.getElementById("vnd-analise-gratis");if(f)f.style.height=e.data.height+"px";}});</script>`,
  };
}

// -----------------------------------------------------------------------------
// Plugin de WordPress: em que sites está instalado e se está desatualizado
// -----------------------------------------------------------------------------
export const FreeAuditPluginSiteSchema = z
  .object({
    site: z.string().meta({ description: 'Endereço do site WordPress (o que o WordPress diz no User-Agent)' }),
    version: z.string().nullable().meta({ description: 'Versão do plugin (null = anterior à 1.9.0, que não a dizia)' }),
    seen_at: z.string().meta({ description: 'Última vez que o plugin falou com a plataforma' }),
    outdated: z.boolean(),
  })
  .meta({ id: 'FreeAuditPluginSite' });
export type FreeAuditPluginSite = z.infer<typeof FreeAuditPluginSiteSchema>;

export const FreeAuditPluginSitesSchema = z
  .object({ latest: z.string().meta({ description: 'A versão atual do plugin (a que se descarrega)' }), sites: z.array(FreeAuditPluginSiteSchema) })
  .meta({ id: 'FreeAuditPluginSites' });
export type FreeAuditPluginSites = z.infer<typeof FreeAuditPluginSitesSchema>;

/** "1.6.1" < "1.10.0"? (números, não texto). Sem versão = mais antiga. */
export function isOlderVersion(version: string | null | undefined, than: string): boolean {
  if (!version) return true;
  const a = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = than.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

/**
 * O site WordPress e a versão do plugin a partir do pedido do plugin: o WordPress manda o
 * User-Agent "WordPress/6.8; https://site.pt" e o plugin (1.9.0+) o cabeçalho X-VND-Plugin-Version.
 */
export function wordpressPluginCaller(userAgent: string | null | undefined, versionHeader: string | null | undefined): { site: string; version: string | null } | null {
  const m = /^WordPress\/[\d.]+;\s*(https?:\/\/[^\s;]+)/i.exec(userAgent ?? '');
  if (!m) return null;
  let site: string;
  try {
    const u = new URL(m[1]!);
    site = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
  if (site.length > 300) return null;
  const version = versionHeader && /^\d{1,3}(\.\d{1,3}){1,2}$/.test(versionHeader.trim()) ? versionHeader.trim() : null;
  return { site, version };
}

/* ---------- Vistas do formulário e pedidos, por site ---------- */

/** O site de uma página ("https://www.Exemplo.pt/contactos" → "exemplo.pt"), ou null. */
export function freeAuditViewSite(page: string | null | undefined): string | null {
  if (!page) return null;
  try {
    const u = new URL(page);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9.-]{1,253}$/.test(host) && host.includes('.') || host === 'localhost' ? host : null;
  } catch {
    return null;
  }
}

export const FreeAuditFormStatsSchema = z
  .object({
    days: z.int(),
    sites: z.array(
      z.object({
        site: z.string(),
        /** Pessoas que viram o formulário (uma vez por dia cada). */
        views: z.int(),
        requests: z.int(),
        /** pedidos ÷ vistas (0–1), ou null sem vistas. */
        rate: z.number().nullable(),
      }),
    ),
  })
  .meta({ id: 'FreeAuditFormStats' });
export type FreeAuditFormStats = z.infer<typeof FreeAuditFormStatsSchema>;
