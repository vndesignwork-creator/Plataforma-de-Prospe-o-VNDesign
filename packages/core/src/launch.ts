/**
 * Checklist de lançamento do site de um cliente: o que confirmar antes de
 * publicar. Uma parte verifica-se sozinha (lendo o site novo); o resto marca-se
 * à mão.
 */
import { z } from 'zod';

export const LAUNCH_CHECKS = [
  { key: 'https', label: 'Abre com HTTPS e o certificado é válido', auto: true },
  { key: 'redirect_https', label: 'http:// e www passam para o endereço com HTTPS', auto: true },
  { key: 'mobile', label: 'Adaptado ao telemóvel', auto: true },
  { key: 'seo', label: 'Título e descrição para o Google em cada página', auto: true },
  { key: 'favicon', label: 'Ícone no separador do browser (favicon)', auto: true },
  { key: 'og_image', label: 'Imagem para partilhas (WhatsApp, Facebook)', auto: true },
  { key: 'not_found', label: 'Página 404 para endereços errados', auto: true },
  { key: 'sitemap', label: 'Sitemap (sitemap.xml)', auto: true },
  { key: 'robots', label: 'O Google pode indexar o site (robots.txt e noindex)', auto: true },
  { key: 'analytics', label: 'Estatísticas instaladas (Google Analytics ou outro)', auto: true },
  { key: 'privacy', label: 'Política de privacidade e cookies (RGPD)', auto: true },
  { key: 'speed', label: 'Velocidade no telemóvel (PageSpeed 70 ou mais)', auto: true },
  { key: 'form_tested', label: 'Formulário de contacto testado (o email chega)', auto: false },
  { key: 'links_tested', label: 'Botões, links, WhatsApp e redes sociais testados', auto: false },
  { key: 'texts_reviewed', label: 'Textos revistos (erros, contactos, horários)', auto: false },
  { key: 'search_console', label: 'Google Search Console ligado e sitemap enviado', auto: false },
  { key: 'google_business', label: 'Perfil da Empresa no Google com o link do site', auto: false },
  { key: 'backups', label: 'Cópias de segurança automáticas ligadas', auto: false },
  { key: 'handover', label: 'Acessos e instruções entregues ao cliente', auto: false },
] as const;
export type LaunchCheckKey = (typeof LAUNCH_CHECKS)[number]['key'];
export const LAUNCH_CHECK_KEYS = LAUNCH_CHECKS.map((c) => c.key) as [LaunchCheckKey, ...LaunchCheckKey[]];

export const LaunchCheckStateSchema = z.object({
  done: z.boolean(),
  /** Resultado da verificação automática (null = ainda não verificado ou só manual). */
  auto: z.boolean().nullable(),
  detail: z.string().nullable(),
  at: z.string().nullable(),
});
export type LaunchCheckState = z.infer<typeof LaunchCheckStateSchema>;

export const LaunchChecklistSchema = z
  .object({
    url: z.string().nullable().meta({ description: 'Endereço do site novo (por omissão, o website do lead)' }),
    checks: z.record(z.enum(LAUNCH_CHECK_KEYS), LaunchCheckStateSchema),
    checked_at: z.string().nullable().meta({ description: 'Última verificação automática' }),
    done: z.int(),
    total: z.int(),
  })
  .meta({ id: 'LaunchChecklist' });
export type LaunchChecklist = z.infer<typeof LaunchChecklistSchema>;

export const LaunchChecklistUpdateSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => v || null),
    /** Marcar/desmarcar pontos à mão. */
    checks: z.partialRecord(z.enum(LAUNCH_CHECK_KEYS), z.boolean()).optional(),
  })
  .meta({ id: 'LaunchChecklistUpdate' });
export type LaunchChecklistUpdate = z.output<typeof LaunchChecklistUpdateSchema>;

/** Estado guardado → checklist completa (pontos sem estado ficam por fazer). */
export function buildLaunchChecklist(
  stored: Partial<Record<string, Partial<LaunchCheckState>>> | null | undefined,
  url: string | null,
  checkedAt: string | null,
): LaunchChecklist {
  const checks = {} as Record<LaunchCheckKey, LaunchCheckState>;
  for (const c of LAUNCH_CHECKS) {
    const s = stored?.[c.key];
    checks[c.key] = { done: !!s?.done, auto: s?.auto ?? null, detail: s?.detail ?? null, at: s?.at ?? null };
  }
  const done = Object.values(checks).filter((c) => c.done).length;
  return { url, checks, checked_at: checkedAt, done, total: LAUNCH_CHECKS.length };
}

export interface LaunchFacts {
  https: boolean;
  sslValid: boolean | null;
  redirectsToHttps: boolean | null;
  html: string;
  faviconFound: boolean;
  notFoundStatus: number | null;
  sitemapFound: boolean;
  robots: string | null;
  pagespeed: number | null;
}

/** Os pontos automáticos a partir do que se leu do site (só os que se conseguiram verificar). */
export function evaluateLaunch(f: LaunchFacts): Partial<Record<LaunchCheckKey, { ok: boolean; detail: string | null }>> {
  const head = f.html.slice(0, 400_000);
  const lower = head.toLowerCase();
  const meta = (name: string) =>
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i').exec(head);
  const title = /<title[^>]*>\s*([^<]+?)\s*<\/title>/i.exec(head)?.[1] ?? null;
  const description = meta('description');
  const noindex = /noindex/i.test(meta('robots')?.[1] ?? meta('robots')?.[2] ?? '');
  const robotsBlocks = !!f.robots && /user-agent:\s*\*[^]*?disallow:\s*\/\s*($|\n)/i.test(f.robots);
  const out: Partial<Record<LaunchCheckKey, { ok: boolean; detail: string | null }>> = {};

  out.https = { ok: f.https && f.sslValid !== false, detail: !f.https ? 'O site abre sem HTTPS.' : f.sslValid === false ? 'Certificado inválido.' : null };
  if (f.redirectsToHttps !== null) out.redirect_https = { ok: f.redirectsToHttps, detail: f.redirectsToHttps ? null : 'http:// não passa para https://.' };
  out.mobile = /<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(head) || /<meta[^>]+content=["'][^"']*width=device-width[^"']*["'][^>]*name=["']viewport["']/i.test(head)
    ? { ok: true, detail: null }
    : { ok: false, detail: 'Falta a meta viewport (width=device-width).' };
  out.seo = {
    ok: !!title && !!(description?.[1] || description?.[2]),
    detail: !title ? 'Sem título.' : !(description?.[1] || description?.[2]) ? 'Sem meta descrição.' : null,
  };
  out.favicon = { ok: f.faviconFound, detail: f.faviconFound ? null : 'Não encontrei o favicon.' };
  out.og_image = meta('og:image') ? { ok: true, detail: null } : { ok: false, detail: 'Falta a og:image.' };
  if (f.notFoundStatus !== null) {
    out.not_found = { ok: f.notFoundStatus === 404 || f.notFoundStatus === 410, detail: f.notFoundStatus === 404 || f.notFoundStatus === 410 ? null : `Um endereço errado devolve ${f.notFoundStatus} em vez de 404.` };
  }
  out.sitemap = { ok: f.sitemapFound, detail: f.sitemapFound ? null : 'Não encontrei o sitemap.xml.' };
  out.robots = { ok: !noindex && !robotsBlocks, detail: noindex ? 'A página tem "noindex": o Google não a mostra.' : robotsBlocks ? 'O robots.txt bloqueia o site todo.' : null };
  const analytics = /googletagmanager\.com|google-analytics\.com|gtag\(|plausible\.io|matomo|umami|clarity\.ms|fbq\(|cloudflareinsights/i.test(head);
  out.analytics = { ok: analytics, detail: analytics ? null : 'Não encontrei Google Analytics nem outra ferramenta de estatísticas.' };
  const privacy = /privacidade|privacy|cookies|rgpd|gdpr/.test(lower);
  out.privacy = { ok: privacy, detail: privacy ? null : 'Não encontrei a política de privacidade nem o aviso de cookies.' };
  if (f.pagespeed !== null) out.speed = { ok: f.pagespeed >= 70, detail: `PageSpeed no telemóvel: ${f.pagespeed}.` };
  return out;
}
