/**
 * PageSpeed Insights (Google) — pontuação de desempenho em telemóvel.
 * Funciona sem chave (com limites baixos); com PAGESPEED_API_KEY o limite é
 * de 25 000 pedidos por dia. AUDIT_SKIP_PAGESPEED=1 desliga (testes/CI).
 */
import { parsePageSpeedResponse, type PageSpeedResult } from '@vndesign/core';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export type PageSpeedOutcome = { ok: true; result: PageSpeedResult } | { ok: false; error: string };

export function isPageSpeedEnabled(): boolean {
  return process.env.AUDIT_SKIP_PAGESPEED !== '1';
}

export async function runPageSpeed(url: string, timeoutMs = 55_000): Promise<PageSpeedOutcome> {
  const params = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', locale: 'pt-PT' });
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set('key', key);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
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
      return { ok: false, error: `O PageSpeed não conseguiu analisar o site (${detail.slice(0, 160)}).` };
    }
    const result = parsePageSpeedResponse(json);
    if (result.score === null) return { ok: false, error: 'O PageSpeed não devolveu pontuação.' };
    return { ok: true, result };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, error: timeout ? 'O PageSpeed demorou demasiado.' : 'Não foi possível contactar o PageSpeed.' };
  }
}
