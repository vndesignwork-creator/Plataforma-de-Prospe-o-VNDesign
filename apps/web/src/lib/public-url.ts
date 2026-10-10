/**
 * Endereço público da plataforma (ex.: https://leads.vndesign.pt).
 *
 * Atrás do proxy da Hostinger, `request.url` é o endereço interno do servidor
 * Node (ex.: http://0.0.0.0:3000), que o browser não consegue abrir. Por isso os
 * redirecionamentos usam, por esta ordem: APP_URL, os cabeçalhos X-Forwarded-*
 * do proxy e, só em último caso, o endereço do pedido.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // APP_URL inválido: segue para os cabeçalhos.
    }
  }
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const fallback = new URL(request.url);
  if (host && !/^0\.0\.0\.0(:|$)/.test(host)) return `${proto || fallback.protocol.replace(':', '')}://${host}`;
  return fallback.origin;
}

/** URL absoluto na plataforma pública (para NextResponse.redirect). */
export function publicUrl(path: string, request: Request): URL {
  return new URL(path, publicOrigin(request));
}
