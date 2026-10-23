/**
 * PageSpeed Insights (Google) — pontuação de desempenho em telemóvel e a imagem
 * do site como o Google o viu (no telemóvel ou no computador).
 * Funciona sem chave (com limites baixos); com PAGESPEED_API_KEY o limite é
 * de 25 000 pedidos por dia. AUDIT_SKIP_PAGESPEED=1 desliga a pontuação na
 * análise (testes/CI); PAGESPEED_ENDPOINT troca o endereço (testes).
 */
import { pageSpeedScreenshot, parsePageSpeedResponse, type PageSpeedResult } from '@vndesign/core';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export type PageSpeedShot = { data: string; width: number | null; height: number | null };
export type PageSpeedOutcome =
  | { ok: true; result: PageSpeedResult; screenshot: PageSpeedShot | null }
  | { ok: false; error: string };

/** Com o certificado SSL inválido, o Chrome da Google não abre o site (nem pontuação nem imagens). */
export const PAGESPEED_SSL_BLOCKED =
  'O Google não abre sites com o certificado SSL expirado ou inválido: não há pontuação nem imagens até o certificado ser renovado. É um bom argumento para falares com o cliente.';

/** Erros do Lighthouse (o motor do PageSpeed) explicados em português. */
export function pageSpeedErrorMessage(detail: string): string {
  if (/INSECURE_DOCUMENT_REQUEST|ERR_CERT|certificate/i.test(detail)) return PAGESPEED_SSL_BLOCKED;
  if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE/i.test(detail)) {
    return 'O Google não conseguiu abrir o site (certificado SSL inválido, o site em baixo ou a bloquear o Google). Sem pontuação nem imagens até isso se resolver.';
  }
  if (/NO_FCP|PAGE_HUNG|NOT_HTML/i.test(detail)) return 'O Google abriu o site, mas a página não chegou a mostrar conteúdo (sem pontuação).';
  return `O PageSpeed não conseguiu analisar o site (${detail.slice(0, 160)}).`;
}

export function isPageSpeedEnabled(): boolean {
  return process.env.AUDIT_SKIP_PAGESPEED !== '1';
}

export async function runPageSpeed(
  url: string,
  timeoutMs = 55_000,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<PageSpeedOutcome> {
  const params = new URLSearchParams({ url, strategy, category: 'performance', locale: 'pt-PT' });
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set('key', key);
  try {
    const res = await fetch(`${process.env.PAGESPEED_ENDPOINT || ENDPOINT}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 429) {
      return {
        ok: false,
        error: key
          ? 'Limite diário do PageSpeed atingido.'
          : 'Limite do PageSpeed sem chave atingido — configura PAGESPEED_API_KEY.',
      };
    }
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) {
      const detail = json?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: pageSpeedErrorMessage(detail) };
    }
    const result = parsePageSpeedResponse(json);
    if (result.score === null) return { ok: false, error: 'O PageSpeed não devolveu pontuação.' };
    return { ok: true, result, screenshot: pageSpeedScreenshot(json) };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, error: timeout ? 'O PageSpeed demorou demasiado.' : 'Não foi possível contactar o PageSpeed.' };
  }
}
