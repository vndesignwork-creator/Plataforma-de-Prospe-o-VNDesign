/**
 * Recolha de uma auditoria: abre o site (com proteção SSRF), lê o certificado
 * e o HTML e, em paralelo, pede a pontuação ao PageSpeed. A interpretação dos
 * resultados está em @vndesign/core (analyzeHtml / buildAuditFindings).
 */
import {
  aiBotsBlockedByRobots,
  analyzeGeoHtml,
  analyzeHtml,
  buildAuditFindings,
  ensureUrlProtocol,
  isSocialOrDirectoryUrl,
  type AuditFacts,
  type GeoFacts,
  type SiteAudit,
} from '@vndesign/core';
import { PAGESPEED_SSL_BLOCKED, isPageSpeedEnabled, runPageSpeed, type PageSpeedOutcome, type PageSpeedShot } from './pagespeed';
import { AuditRequestError, safeGet, type SafeResponse } from './safe-request';

export type AuditRecord = Omit<SiteAudit, 'id' | 'lead_id' | 'created_at' | 'screenshots'>;
/** A análise e, se o PageSpeed correu, a imagem do site no telemóvel (vem na mesma resposta). */
export type AuditCollected = { record: AuditRecord; mobileShot: PageSpeedShot | null };

const EMPTY: Omit<AuditRecord, 'url' | 'status'> = {
  final_url: null,
  http_status: null,
  response_ms: null,
  https: null,
  ssl_valid: null,
  ssl_issuer: null,
  ssl_expires_at: null,
  ssl_error: null,
  has_viewport: null,
  zoom_blocked: null,
  pagespeed_mobile: null,
  metrics: {},
  title: null,
  meta_description: null,
  cms: null,
  copyright_year: null,
  issues: [],
  suggested_problems: null,
  suggested_mobile: null,
  error: null,
};

/** Abre o site; se o https:// falhar, tenta o http:// (sites sem certificado). */
async function fetchSite(url: string): Promise<SafeResponse> {
  try {
    return await safeGet(url);
  } catch (error) {
    if (url.startsWith('https://') && error instanceof AuditRequestError && error.code !== 'blocked' && error.code !== 'dns') {
      return await safeGet(`http://${url.slice('https://'.length)}`);
    }
    throw error;
  }
}

/** Robôs das IAs bloqueados no robots.txt (sem robots.txt = nada bloqueado; null = não deu para ler). */
async function readAiBotsBlocked(siteUrl: string): Promise<string[] | null> {
  try {
    const res = await safeGet(new URL('/robots.txt', siteUrl).toString(), { timeoutMs: 6_000, maxBytes: 300_000 });
    if (res.status === 404 || res.status === 410) return [];
    if (res.status >= 400) return null;
    // Alguns sites devolvem a página inicial em vez de um robots.txt: não é um robots.txt.
    if (/html/i.test(String(res.headers['content-type'] ?? ''))) return [];
    return aiBotsBlockedByRobots(res.body);
  } catch {
    return null;
  }
}

export async function collectAudit(rawUrl: string): Promise<AuditCollected> {
  const url = ensureUrlProtocol(rawUrl.trim());
  const now = new Date();

  if (isSocialOrDirectoryUrl(url)) {
    const findings = buildAuditFindings({ own_site: false, reachable: false }, now);
    const record: AuditRecord = { ...EMPTY, url, status: 'done', issues: findings.issues, suggested_problems: findings.suggested_problems, suggested_mobile: findings.suggested_mobile };
    return { record, mobileShot: null };
  }

  const pagespeedPromise: Promise<PageSpeedOutcome | null> = isPageSpeedEnabled() ? runPageSpeed(url) : Promise.resolve(null);

  let page: SafeResponse | null = null;
  let networkError: AuditRequestError | null = null;
  try {
    page = await fetchSite(url);
  } catch (error) {
    if (!(error instanceof AuditRequestError)) throw error;
    networkError = error;
  }

  if (networkError?.code === 'blocked' || networkError?.code === 'protocol') {
    return { record: { ...EMPTY, url, status: 'error', error: networkError.message }, mobileShot: null };
  }

  // O robots.txt lê-se enquanto se espera pelo PageSpeed.
  const robotsPromise = page ? readAiBotsBlocked(page.url) : Promise.resolve(null);
  // Sem resposta do site não vale a pena esperar pelo PageSpeed.
  const speed = page ? await pagespeedPromise : null;
  // Certificado inválido: o Google não abre o site; diz-se porquê em vez do erro técnico.
  const pagespeed: PageSpeedOutcome | null =
    speed && !speed.ok && page?.certificate?.valid === false ? { ok: false, error: PAGESPEED_SSL_BLOCKED } : speed;

  const isHtml = page ? /html|xml/i.test(String(page.headers['content-type'] ?? 'text/html')) : false;
  const html = page && isHtml && page.status < 400 ? analyzeHtml(page.body, now) : null;
  const https = page ? page.url.startsWith('https://') : null;
  // GEO: o que a página mostra às IAs e se o robots.txt as deixa entrar.
  const geo: GeoFacts | null = page && html ? { ...analyzeGeoHtml(page.body), ai_bots_blocked: await robotsPromise } : null;

  const facts: AuditFacts = {
    own_site: true,
    reachable: page !== null,
    http_status: page?.status ?? null,
    response_ms: page?.response_ms ?? null,
    https,
    ssl_valid: page?.certificate?.valid ?? null,
    ssl_expires_at: page?.certificate?.expires_at ?? null,
    html,
    pagespeed: pagespeed?.ok ? pagespeed.result : null,
    geo,
  };
  const findings = buildAuditFindings(facts, now);

  const record: AuditRecord = {
    ...EMPTY,
    url,
    status: 'done',
    final_url: page?.url ?? null,
    http_status: page?.status ?? null,
    response_ms: page?.response_ms ?? null,
    https,
    ssl_valid: page?.certificate?.valid ?? null,
    ssl_issuer: page?.certificate?.issuer ?? null,
    ssl_expires_at: page?.certificate?.expires_at ?? null,
    ssl_error: page?.certificate?.error ?? null,
    has_viewport: html?.has_viewport ?? null,
    zoom_blocked: html?.zoom_blocked ?? null,
    pagespeed_mobile: pagespeed?.ok ? pagespeed.result.score : null,
    metrics: {
      ...(pagespeed?.ok ? pagespeed.result.metrics : {}),
      ...(pagespeed && !pagespeed.ok ? { pagespeed_error: pagespeed.error } : {}),
      ...(pagespeed === null && page ? { pagespeed_skipped: true } : {}),
      ...(geo ? { geo } : {}),
    },
    title: html?.title ?? null,
    meta_description: html?.meta_description ?? null,
    cms: html?.cms ?? null,
    copyright_year: html?.copyright_year ?? null,
    issues: findings.issues,
    suggested_problems: findings.suggested_problems,
    suggested_mobile: findings.suggested_mobile,
    error: networkError?.message ?? null,
  };
  return { record, mobileShot: pagespeed?.ok ? pagespeed.screenshot : null };
}
