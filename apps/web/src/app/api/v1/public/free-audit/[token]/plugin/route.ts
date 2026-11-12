import { publicOrigin } from '@/lib/public-url';
import { freeAuditTokenActive } from '@/server/services/free-audit';
import { WP_PLUGIN_SLUG, WP_PLUGIN_VERSION, wordpressPluginZip } from '@/server/wp-plugin';

export const runtime = 'nodejs';

/*
 * GET /api/v1/public/free-audit/{código}/plugin — o plugin de WordPress (.zip) já ligado a esta
 * página, sem login: é daqui que o WordPress o descarrega quando carregas em "Atualizar agora"
 * (ou nas atualizações automáticas). O código já está à vista no formulário do site.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !(await freeAuditTokenActive(token))) {
    return new Response('Esta página não existe ou foi desligada.', { status: 404 });
  }
  const zip = wordpressPluginZip(`${publicOrigin(req)}/analise/${token}`);
  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${WP_PLUGIN_SLUG}-${WP_PLUGIN_VERSION}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
