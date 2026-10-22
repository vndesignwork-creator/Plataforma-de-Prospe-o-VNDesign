/**
 * Checklist de lançamento do site de um cliente (lead_projects.launch_*):
 * marcar pontos à mão e verificar sozinho o site novo (HTTPS, telemóvel, SEO,
 * favicon, 404, sitemap, robots, estatísticas, privacidade e PageSpeed).
 */
import {
  LAUNCH_CHECKS,
  buildLaunchChecklist,
  ensureUrlProtocol,
  evaluateLaunch,
  type LaunchCheckKey,
  type LaunchCheckState,
  type LaunchChecklist,
  type LaunchChecklistUpdate,
} from '@vndesign/core';
import { isPageSpeedEnabled, runPageSpeed } from '../audit/pagespeed';
import { AuditRequestError, safeGet } from '../audit/safe-request';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead } from './leads';

type Stored = Partial<Record<LaunchCheckKey, LaunchCheckState>>;
type Row = { launch_url: string | null; launch_checks: Stored | null; launch_checked_at: string | null };

async function load(ctx: ApiContext, leadId: string): Promise<{ row: Row; website: string | null }> {
  const lead = await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('lead_projects')
    .select('launch_url, launch_checks, launch_checked_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  return { row: (data as Row | null) ?? { launch_url: null, launch_checks: {}, launch_checked_at: null }, website: lead.website };
}

async function save(ctx: ApiContext, leadId: string, patch: Partial<Row>): Promise<Row> {
  const { data, error } = await ctx.supabase
    .from('lead_projects')
    .upsert({ lead_id: leadId, workspace_id: ctx.workspaceId, ...patch }, { onConflict: 'lead_id' })
    .select('launch_url, launch_checks, launch_checked_at')
    .single();
  if (error) throw fromPostgrest(error);
  return data as Row;
}

const toChecklist = (row: Row, website: string | null): LaunchChecklist =>
  buildLaunchChecklist(row.launch_checks, row.launch_url ?? website, row.launch_checked_at);

export async function getLaunchChecklist(ctx: ApiContext, leadId: string): Promise<LaunchChecklist> {
  const { row, website } = await load(ctx, leadId);
  return toChecklist(row, website);
}

export async function updateLaunchChecklist(ctx: ApiContext, leadId: string, input: LaunchChecklistUpdate): Promise<LaunchChecklist> {
  const { row, website } = await load(ctx, leadId);
  const checks: Stored = { ...(row.launch_checks ?? {}) };
  const now = new Date().toISOString();
  for (const [key, done] of Object.entries(input.checks ?? {}) as [LaunchCheckKey, boolean][]) {
    const prev = checks[key];
    checks[key] = { done, auto: prev?.auto ?? null, detail: prev?.detail ?? null, at: now };
  }
  const patch: Partial<Row> = { launch_checks: checks };
  if (input.url !== undefined) patch.launch_url = input.url ? ensureUrlProtocol(input.url) : null;
  return toChecklist(await save(ctx, leadId, patch), website);
}

/** Pedido que nunca falha (null = não foi possível abrir). */
async function tryGet(url: string, maxBytes = 300_000) {
  try {
    return await safeGet(url, { timeoutMs: 10_000, maxBytes });
  } catch {
    return null;
  }
}

/** Verifica o site novo e atualiza os pontos automáticos (os manuais ficam como estão). */
export async function runLaunchChecks(ctx: ApiContext, leadId: string): Promise<LaunchChecklist> {
  const { row, website } = await load(ctx, leadId);
  const target = row.launch_url ?? website;
  if (!target) throw new ApiError(422, 'Sem endereço', 'Indica o endereço do site novo.');
  const url = ensureUrlProtocol(target);

  const speed = isPageSpeedEnabled() ? runPageSpeed(url) : Promise.resolve(null);
  let page;
  try {
    page = await safeGet(url, { timeoutMs: 15_000 });
  } catch (error) {
    throw new ApiError(422, 'Não foi possível abrir o site', error instanceof AuditRequestError ? error.message : undefined);
  }
  if (page.status >= 400) throw new ApiError(422, 'O site deu erro', `O endereço respondeu com o código ${page.status}.`);
  const origin = new URL(page.url).origin;
  const host = new URL(page.url).hostname;

  const iconHref = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(page.body)?.[1] ?? null;
  const [httpVersion, favicon, missing, sitemap, robots, pagespeed] = await Promise.all([
    page.url.startsWith('https://') ? tryGet(`http://${host}/`, 50_000) : Promise.resolve(null),
    iconHref ? Promise.resolve({ status: 200 }) : tryGet(`${origin}/favicon.ico`, 50_000),
    tryGet(`${origin}/esta-pagina-nao-existe-${Date.now().toString(36)}`, 50_000),
    tryGet(`${origin}/sitemap.xml`, 200_000).then(async (r) => (r && r.status < 400 ? r : tryGet(`${origin}/sitemap_index.xml`, 200_000))),
    tryGet(`${origin}/robots.txt`, 50_000),
    speed,
  ]);

  const results = evaluateLaunch({
    https: page.url.startsWith('https://'),
    sslValid: page.certificate?.valid ?? null,
    redirectsToHttps: page.url.startsWith('https://') ? (httpVersion ? httpVersion.url.startsWith('https://') : null) : false,
    html: page.body,
    faviconFound: !!favicon && favicon.status < 400,
    notFoundStatus: missing?.status ?? null,
    sitemapFound: !!sitemap && sitemap.status < 400 && /<(urlset|sitemapindex)/i.test(sitemap.body),
    robots: robots && robots.status < 400 ? robots.body : null,
    pagespeed: pagespeed?.ok ? pagespeed.result.score : null,
  });

  const now = new Date().toISOString();
  const checks: Stored = { ...(row.launch_checks ?? {}) };
  for (const c of LAUNCH_CHECKS) {
    const r = results[c.key];
    if (!c.auto || !r) continue;
    checks[c.key] = { done: r.ok, auto: r.ok, detail: r.detail, at: now };
  }
  return toChecklist(await save(ctx, leadId, { launch_checks: checks, launch_checked_at: now, launch_url: row.launch_url }), website);
}
