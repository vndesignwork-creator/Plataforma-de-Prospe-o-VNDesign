import { publicOrigin } from '@/lib/public-url';
import { ApiError, apiRoute } from '@/server/http';
import { WP_PLUGIN_SLUG, WP_PLUGIN_VERSION, wordpressPluginZip } from '@/server/wp-plugin';
import { getSettings } from '@/server/services/workspace';

export const runtime = 'nodejs';

/** GET /api/v1/free-audit/wordpress-plugin — o plugin de WordPress (.zip) já ligado à página desta conta. */
export const GET = apiRoute(async (req, ctx) => {
  const token = (await getSettings(ctx)).free_audit.token;
  if (!token) throw new ApiError(409, 'Análise grátis desligada', 'Liga primeiro a análise grátis (Definições → Formulário do site).');
  const zip = wordpressPluginZip(`${publicOrigin(req)}/analise/${token}`);
  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${WP_PLUGIN_SLUG}-${WP_PLUGIN_VERSION}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
