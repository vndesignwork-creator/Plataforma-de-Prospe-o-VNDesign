#!/usr/bin/env node
/**
 * Copia o plugin de WordPress (integrations/wordpress/vndesign-analise-gratis) para um
 * módulo TS, para a plataforma o servir em .zip (com o endereço de cada conta já posto).
 * Correr depois de mudar o plugin: npm run build:wp-plugin (o teste avisa se faltar).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const PLUGIN_DIR = join(root, 'integrations/wordpress/vndesign-analise-gratis');
const OUT = join(root, 'apps/web/src/server/wp-plugin/plugin-files.generated.ts');

export function pluginFiles(dir = PLUGIN_DIR) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.') || name === 'config.php') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

export function generatedSource(files = pluginFiles()) {
  const version = /Version:\s*([\d.]+)/.exec(files['vndesign-analise-gratis.php'] ?? '')?.[1] ?? '0.0.0';
  return (
    '// Gerado por scripts/build-wp-plugin.mjs a partir de integrations/wordpress/vndesign-analise-gratis. Não editar à mão.\n' +
    `export const WP_PLUGIN_VERSION = ${JSON.stringify(version)};\n` +
    `export const WP_PLUGIN_FILES: Record<string, string> = ${JSON.stringify(files, null, 2)};\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, generatedSource());
  console.log(`Plugin copiado para ${relative(root, OUT)}`);
}
