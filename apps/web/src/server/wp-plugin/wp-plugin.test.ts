import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { WP_PLUGIN_FILES } from './plugin-files.generated';
import { wordpressPluginConfig, wordpressPluginZip } from './index';

const ROOT = join(__dirname, '../../../../..');
const PLUGIN_DIR = join(ROOT, 'integrations/wordpress/vndesign-analise-gratis');
const HARNESS = join(ROOT, 'integrations/wordpress/tests/render-harness.php');
const hasPhp = spawnSync('php', ['-v']).status === 0;

function sourceFiles(dir = PLUGIN_DIR): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
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

/** Lê um .zip (só o que o createZip escreve). */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extra;
    out[name] = inflateRawSync(buf.subarray(start, start + size)).toString('utf8');
    i = start + size;
  }
  return out;
}

function render(options: Record<string, unknown>, atts: Record<string, unknown> = {}, admin = false): string {
  const res = spawnSync('php', [HARNESS, JSON.stringify(options), JSON.stringify(atts)], { encoding: 'utf8', env: { ...process.env, VND_ADMIN: admin ? '1' : '0' } });
  expect(res.stderr).toBe('');
  return res.stdout;
}

const PAGE = 'https://leads.vndesign.pt/analise/abcdefghijklmnop1234';

describe('plugin de WordPress', () => {
  it('a cópia na plataforma está igual ao plugin (senão: npm run build:wp-plugin)', () => {
    expect(WP_PLUGIN_FILES).toEqual(sourceFiles());
  });

  it('o .zip tem a pasta do plugin e o endereço da conta', () => {
    const files = unzip(wordpressPluginZip(PAGE));
    expect(Object.keys(files)).toContain('vndesign-analise-gratis/vndesign-analise-gratis.php');
    expect(Object.keys(files)).toContain('vndesign-analise-gratis/includes/bricks-element.php');
    expect(files['vndesign-analise-gratis/assets/form.js']).toBe(WP_PLUGIN_FILES['assets/form.js']);
    expect(files['vndesign-analise-gratis/config.php']).toContain(`'page_url' => '${PAGE}'`);
  });

  it('não aceita endereços estranhos no config.php', () => {
    expect(() => wordpressPluginConfig("https://x.pt/analise/abcdefghijklmnop1234');phpinfo();//")).toThrow();
    expect(() => wordpressPluginConfig('https://x.pt/outra/abcdefghijklmnop1234')).toThrow();
  });

  it.skipIf(!hasPhp)('o PHP não tem erros de sintaxe', () => {
    for (const name of Object.keys(WP_PLUGIN_FILES).filter((n) => n.endsWith('.php'))) {
      const res = spawnSync('php', ['-l', join(PLUGIN_DIR, name)], { encoding: 'utf8' });
      expect(res.status, `${name}: ${res.stdout}${res.stderr}`).toBe(0);
    }
  });

  it.skipIf(!hasPhp)('o formulário envia para a plataforma, com os textos escapados', () => {
    const html = render({ page_url: PAGE }, { title: 'Olá <script>x</script>', theme: 'light', show_company: '0' });
    expect(html).toContain('action="https://leads.vndesign.pt/api/v1/public/free-audit/abcdefghijklmnop1234"');
    expect(html).toContain('data-vnd-fa-form');
    expect(html).toContain('vnd-fa--light');
    expect(html).toContain('Olá &lt;script&gt;');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('name="website"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="name"');
    expect(html).not.toContain('name="company"');
    expect(html).toContain('name="_gotcha"');
    expect(html).toContain('Aceito que Padaria &amp; Filhos me envie');
    expect(html).toContain('enqueued:style:vnd-fa,script:vnd-fa');
  });

  it.skipIf(!hasPhp)('o código sozinho também serve; valores inválidos voltam ao de origem', () => {
    const html = render({ page_url: 'abcdefghijklmnop1234', theme: 'roxo', accent: 'red;}' });
    expect(html).toContain('https://leads.vndesign.pt/api/v1/public/free-audit/abcdefghijklmnop1234');
    expect(html).toContain('vnd-fa--dark');
    expect(html).not.toContain('red;}');
  });

  it.skipIf(!hasPhp)('texto de persuasão: liga e desliga, direita ou esquerda, ordem no telemóvel', () => {
    const on = render({ page_url: PAGE });
    expect(on).toContain('vnd-fa--promo vnd-fa--promo-left');
    expect(on).toContain('O seu site está a afastar clientes');
    expect(on).toContain('assets/promo.svg');
    expect(on.match(/<li>/g)?.length).toBe(4);
    // De origem: o texto à esquerda e, no telemóvel, por cima do formulário.
    expect(on.indexOf('vnd-fa__promo')).toBeLessThan(on.indexOf('vnd-fa__main'));
    expect(on).toContain('width="1000" height="500"');
    expect(on).toContain('--vnd-fa-cols:minmax(0,1fr) minmax(0,1fr)');
    // Largura: de origem ocupa o sítio onde está; com "máxima", o valor escolhido.
    expect(on).toContain('--vnd-fa-max:none');
    expect(render({ page_url: PAGE }, { width: 'max' })).toContain('--vnd-fa-max:1120px');
    expect(render({ page_url: PAGE }, { width: 'max', promo: '0' })).toContain('--vnd-fa-max:640px');
    expect(render({ page_url: PAGE }, { columns_gap: '64' })).toContain('--vnd-fa-gap:64px');

    const right = render({ page_url: PAGE }, { promo_position: 'right', promo_mobile: 'after', promo_ratio: 'form', promo_points: 'Um<b>\nDois', promo_image: 'https://site.test/foto.jpg' });
    expect(right).toContain('vnd-fa--promo-right');
    expect(right.indexOf('vnd-fa__main')).toBeLessThan(right.indexOf('vnd-fa__promo'));
    expect(right).toContain('--vnd-fa-cols:minmax(0,1.25fr) minmax(0,1fr)');
    expect(right).toContain('<span>Um&lt;b&gt;</span>');
    expect(right).toContain('src="https://site.test/foto.jpg"');

    const off = render({ page_url: PAGE, promo: '0' });
    expect(off).not.toContain('vnd-fa__promo');
    expect(off).not.toContain('vnd-fa__grid');
    expect(render({ page_url: PAGE }, { promo_image_show: '0' })).not.toContain('<img');
  });

  it.skipIf(!hasPhp)('letra: a do site de origem; ou uma da lista / outra, carregada do Bunny ou do Google', () => {
    const site = render({ page_url: PAGE });
    expect(site).not.toContain('vnd-fa--font');
    expect(site).not.toContain('fonts.');

    const bunny = render({ page_url: PAGE, font_body: 'Plus Jakarta Sans', font_heading: 'body' });
    expect(bunny).toContain('vnd-fa--font vnd-fa--font-heading');
    expect(bunny).toContain('--vnd-fa-font:&quot;Plus Jakarta Sans&quot;, system-ui, sans-serif');
    expect(bunny).toContain('https://fonts.bunny.net/css?family=plus-jakarta-sans:400,500,600,700,800&display=swap');

    const google = render({ page_url: PAGE, font_body: 'Inter', font_heading: 'custom', font_heading_custom: 'Urbanist<script>', font_source: 'google' });
    expect(google).toContain('--vnd-fa-font-heading:&quot;Urbanistscript&quot;');
    expect(google).not.toContain('<script>');
    expect(google).toContain('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Urbanistscript:wght@400;600;700&display=swap');

    const none = render({ page_url: PAGE, font_body: 'Lora', font_source: 'none' });
    expect(none).toContain('&quot;Lora&quot;, Georgia, serif');
    expect(none).not.toContain('fonts.');
    // Títulos "a do site": só o texto muda.
    expect(none).not.toContain('vnd-fa--font-heading');
  });

  it.skipIf(!hasPhp)('sem ligação: só o administrador vê o aviso', () => {
    expect(render({}).replace(/\n<!--.*-->/, '')).toBe('');
    expect(render({}, {}, true)).toContain('Falta ligar o formulário à plataforma');
  });
});
