/**
 * O plugin de WordPress "Análise grátis do site" em .zip, já com o endereço da página
 * desta conta (config.php): basta carregar no WordPress e ativar.
 */
import { createZip } from '../zip';
import { WP_PLUGIN_FILES, WP_PLUGIN_VERSION } from './plugin-files.generated';

export const WP_PLUGIN_SLUG = 'vndesign-analise-gratis';
export { WP_PLUGIN_VERSION };

export function wordpressPluginConfig(pageUrl: string): string {
  if (!/^https?:\/\/[A-Za-z0-9.:-]+\/analise\/[A-Za-z0-9_-]{16,64}$/.test(pageUrl)) throw new Error('Endereço da página inválido');
  return `<?php\n// Gerado pela plataforma VNDesign Leads: o endereço da tua página "Analisar o meu site grátis".\nif (!defined('ABSPATH')) {\n\texit;\n}\nreturn array('page_url' => '${pageUrl}');\n`;
}

export function wordpressPluginZip(pageUrl: string): Buffer {
  const entries = Object.entries(WP_PLUGIN_FILES).map(([name, data]) => ({ name: `${WP_PLUGIN_SLUG}/${name}`, data }));
  entries.push({ name: `${WP_PLUGIN_SLUG}/config.php`, data: wordpressPluginConfig(pageUrl) });
  return createZip(entries);
}
