/**
 * Endereço público da plataforma dentro de um pedido à API, sem ter o Request à
 * mão (ex.: para os links de um email). Mesma ordem que publicOrigin(): APP_URL,
 * depois os cabeçalhos do proxy. Fora de um pedido (cron) só serve o APP_URL.
 */
import { headers } from 'next/headers';

export async function requestOrigin(): Promise<string | null> {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // APP_URL inválido: segue para os cabeçalhos.
    }
  }
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host')?.split(',')[0]?.trim() || h.get('host');
    if (!host || /^0\.0\.0\.0(:|$)/.test(host)) return null;
    const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}
