import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const run = Date.now().toString(36);
const FROM = `va+an${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

async function connectAccount(page: Page) {
  const res = await page.request.put('/api/v1/mail-account', {
    data: { provider: 'custom', from_name: 'Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false, smtp_user: 'teste', password: 'segredo' },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function mailTo(request: APIRequestContext, address: string) {
  let found: { ID: string; Subject: string; Attachments: number } | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        found = ((await res.json()).messages ?? [])[0];
        return !!found;
      },
      { timeout: 90_000, intervals: [2000] },
    )
    .toBe(true);
  return found!;
}

/** Um "site" local (em desenvolvimento os endereços locais podem ser analisados). */
async function localSite(status = () => 200) {
  const server = http.createServer((_req, res) => {
    res.writeHead(status(), { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="pt"><head><title>Padaria</title><meta name="viewport" content="width=device-width"></head><body><h1>Padaria</h1><p>Pão quente.</p></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
}

test('Os teus emails chegam? Verificação do domínio de envio (SPF, DKIM, DMARC)', async ({ page }) => {
  await connectAccount(page);
  await page.goto('/definicoes/email');
  await page.getByRole('button', { name: 'Verificar o domínio' }).click();
  const list = page.getByRole('list', { name: 'Verificações do domínio' });
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list.getByText('SPF', { exact: true })).toBeVisible();
  await expect(list.getByText('DKIM', { exact: true })).toBeVisible();
  await expect(list.getByText('DMARC', { exact: true })).toBeVisible();
  const report = (await (await page.request.get('/api/v1/mail-account/deliverability')).json()).data as { domain: string; status: string };
  expect(report.domain).toBe('vndesign.pt');
  expect(['ok', 'warn', 'fail', 'unknown']).toContain(report.status);
  expect((await page.request.get('/api/v1/mail-account/deliverability?selector=x y')).status()).toBe(400);
});

test('Objeções: resposta pronta na Prospeção (canal, outra versão) e pela API', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Objeção ${run}`, contact_name: 'Rui Matos', phone: '912000111', email: `rui@objecao-${run}.pt` } })).json()).data as { id: string };
  const res = await page.request.post(`/api/v1/leads/${lead.id}/objection`, { data: { objection: 'price', channel: 'whatsapp', ai: false } });
  expect(res.status()).toBe(200);
  const reply = (await res.json()).data as { reply: string; source: string; tip: string };
  expect(reply.source).toBe('template');
  expect(reply.reply).toContain('Rui');
  expect(reply.reply).toContain(`Objeção ${run}`);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/objection`, { data: { objection: 'xpto' } })).status()).toBe(400);

  // Na ficha (cartão de contacto): o botão "Objeção" abre a resposta para este lead.
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: `Responder a uma objeção de Objeção ${run}` }).first().click();
  await page.getByRole('menuitem', { name: '“Já tenho site”' }).click();
  const dialog = page.getByRole('dialog', { name: '“Já tenho site”' });
  await expect(dialog.getByLabel('Resposta')).not.toHaveValue('', { timeout: 60_000 });
  await dialog.getByRole('radio', { name: 'Email' }).click();
  await expect(dialog.getByLabel('Resposta')).toHaveValue(/Cumprimentos,/, { timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Fechar' }).last().click();
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});

test('Oportunidade: site do lead em baixo aparece na ficha com a mensagem pronta e na Prospeção', async ({ page }) => {
  let up = true;
  const { server, url } = await localSite(() => (up ? 200 : 503));
  try {
    const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Oportunidade ${run}`, phone: '912000222', email: `geral@op-${run}.pt`, website: url } })).json()).data as { id: string; number: number };
    const monitor = (await (await page.request.post(`/api/v1/leads/${lead.id}/site-monitor`, { data: { url } })).json()).data as { id: string };
    up = false;
    await page.request.post(`/api/v1/site-monitors/${monitor.id}/check`);
    const m = (await (await page.request.post(`/api/v1/site-monitors/${monitor.id}/check`)).json()).data as { down_since: string | null };
    expect(m.down_since).not.toBeNull();

    await page.goto(`/leads/${lead.id}`);
    const banner = page.getByRole('status', { name: 'Oportunidade' });
    await expect(banner).toContainText('O site está em baixo');
    await expect(banner.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me|whatsapp/);
    await expect(banner.getByRole('button', { name: 'Copiar mensagem' })).toBeVisible();

    const queue = (await (await page.request.get('/api/v1/prospecting?mode=phone')).json()).data as { items: { lead: { id: string }; opportunity?: { kind: string } | null }[] };
    const item = queue.items.find((i) => i.lead.id === lead.id);
    if (item) expect(item.opportunity?.kind).toBe('down');

    // Volta ao ar: o aviso desaparece.
    up = true;
    await page.request.post(`/api/v1/site-monitors/${monitor.id}/check`);
    await page.reload();
    await expect(page.getByRole('status', { name: 'Oportunidade' })).toHaveCount(0);
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  } finally {
    server.close();
  }
});

test('Analisar o meu site grátis: ligar, pedir pela página pública, lead quente e o PDF por email', async ({ page, browser }) => {
  await connectAccount(page);
  const { server, url } = await localSite();
  try {
    const settings = (await (await page.request.post('/api/v1/free-audit', { data: { enabled: true, rotate: true } })).json()).data as { token: string };
    expect(settings.token).toMatch(/^[\w-]{16,}$/);
    await page.goto('/definicoes/formulario');
    await expect(page.getByLabel('Endereço da página')).toContainText(`/analise/${settings.token}`);

    // A página pública (sem sessão).
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pub = await visitor.newPage();
    await pub.goto(`/analise/${settings.token}`);
    // Com o texto de persuasão, o título da página é o dele (um título a menos).
    await expect(pub.getByRole('heading', { level: 1, name: 'O seu site está a afastar clientes sem dar por isso?' })).toBeVisible();
    await expect(pub.getByText('IA: se o ChatGPT, o Gemini e outras IAs encontram e recomendam o seu negócio')).toBeVisible();
    await expect(pub.getByRole('link', { name: 'Ver um exemplo do relatório (PDF)' })).toHaveAttribute('href', `/api/v1/public/free-audit/${settings.token}/exemplo`);
    const to = `dono@padaria-${run}.pt`;
    await pub.getByLabel('Endereço do site *').fill(url);
    await pub.getByLabel('Email para receber a análise *').fill(to);
    await pub.getByLabel('O seu nome').fill('Marta Sousa');
    await pub.getByLabel('Nome do negócio').fill(`Padaria Grátis ${run}`);
    // Sem aceitar: não envia.
    await pub.getByRole('button', { name: 'Analisar o meu site' }).click();
    await expect(pub.getByText('Aceite que o contactemos com a análise.')).toBeVisible();
    await pub.getByRole('checkbox').check();
    await pub.getByRole('button', { name: 'Analisar o meu site' }).click();
    await expect(pub.getByText(/vai receber a análise por email/)).toBeVisible();
    // O primeiro resultado aparece no ecrã quando a análise acaba.
    await expect(pub.getByText('O primeiro resultado:')).toBeVisible({ timeout: 90_000 });
    await expect(pub.getByText('Velocidade no telemóvel', { exact: true })).toBeVisible();
    await visitor.close();

    // O lead quente, com "Ligar" para hoje, e o email com o PDF em anexo.
    const leads = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Padaria Grátis ${run}`)}`)).json()).data as { id: string; status: string; next_action_text: string }[];
    expect(leads[0]).toMatchObject({ status: 'respondeu', next_action_text: 'Ligar: pediu a análise grátis do site' });
    const message = await mailTo(page.request, to);
    expect(message.Subject).toContain('A análise do site');
    expect(message.Attachments).toBe(1);

    // A origem fica na linha do tempo; os números contam o pedido.
    const stats = (await (await page.request.get('/api/v1/free-audit/stats')).json()).data as { month: number; total: number; sources: { key: string }[] };
    expect(stats.month).toBeGreaterThanOrEqual(1);
    expect(stats.sources.length).toBeGreaterThanOrEqual(1);
    // O PDF de exemplo e "o site abre?".
    const example = await page.request.get(`/api/v1/public/free-audit/${settings.token}/exemplo`);
    expect(example.headers()['content-type']).toBe('application/pdf');
    expect((await example.body()).subarray(0, 4).toString()).toBe('%PDF');
    expect((await (await page.request.get(`/api/v1/public/free-audit/${settings.token}/verificar-site?url=${encodeURIComponent(url)}`)).json()).ok).toBe(true);
    expect((await (await page.request.get(`/api/v1/public/free-audit/${settings.token}/verificar-site?url=${encodeURIComponent('http://127.0.0.1:9/')}`)).json()).ok).toBe(false);
    // Um pedido inventado não mostra o resultado de ninguém.
    expect((await page.request.get(`/api/v1/public/free-audit/${settings.token}/estado/inventado.abc`)).status()).toBe(404);
    // Follow-up e Turnstile (as chaves de teste ficam e saem).
    const cfg = (await (await page.request.patch('/api/v1/free-audit', { data: { follow_up_days: 5, turnstile_site_key: '1x00000000000000000000AA', turnstile_secret: '1x0000000000000000000000000000000AA' } })).json()).data as Record<string, unknown>;
    expect(cfg).toMatchObject({ follow_up_days: 5, turnstile_site_key: '1x00000000000000000000AA', turnstile_secret_hint: '…00AA' });
    expect(String(cfg.turnstile_secret)).not.toContain('1x0000000000');
    expect((await (await page.request.get(`/api/v1/public/free-audit/${settings.token}`)).json()).turnstile_site_key).toBe('1x00000000000000000000AA');
    await page.request.patch('/api/v1/free-audit', { data: { follow_up_days: 3, turnstile_site_key: null, turnstile_secret: null } });
    expect((await (await page.request.get(`/api/v1/public/free-audit/${settings.token}`)).json()).turnstile_site_key).toBeNull();

    // Código errado e desligar.
    expect((await page.request.post('/api/v1/public/free-audit/nao-existe-este-codigo', { data: { website: url, email: to, consent: true } })).status()).toBe(404);
    await page.request.post('/api/v1/free-audit', { data: { enabled: false } });
    const off = await page.request.get(`/analise/${settings.token}`);
    expect(off.status()).toBe(404);
    await page.request.delete(`/api/v1/leads/${leads[0]!.id}`);
  } finally {
    server.close();
  }
});

const WP = join(__dirname, '../integrations/wordpress');
const hasPhp = spawnSync('php', ['-v']).status === 0;

test('Plugin de WordPress: descarregar já ligado e o formulário (noutro site) cria o lead', async ({ page, browser }) => {
  await connectAccount(page);
  const settings = (await (await page.request.post('/api/v1/free-audit', { data: { enabled: true, rotate: true } })).json()).data as { token: string };
  await page.goto('/definicoes/formulario');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Descarregar o plugin' }).click();
  expect((await download).suggestedFilename()).toMatch(/^vndesign-analise-gratis-[\d.]+\.zip$/);
  const res = await page.request.get('/api/v1/free-audit/wordpress-plugin');
  expect(res.headers()['content-type']).toBe('application/zip');
  // O config.php dentro do .zip leva o endereço desta conta.
  const zip = await res.body();
  const at = zip.indexOf(Buffer.from('vndesign-analise-gratis/config.php'));
  expect(at).toBeGreaterThan(30);
  const head = at - 30;
  const config = inflateRawSync(zip.subarray(at + zip.readUInt16LE(head + 26) + zip.readUInt16LE(head + 28), at + zip.readUInt16LE(head + 26) + zip.readUInt16LE(head + 28) + zip.readUInt32LE(head + 18))).toString('utf8');
  expect(config).toContain(`/analise/${settings.token}'`);

  // "Testar ligação" do plugin e código errado.
  expect((await page.request.get(`/api/v1/public/free-audit/${settings.token}`)).status()).toBe(200);
  expect((await page.request.get('/api/v1/public/free-audit/nao-existe-este-codigo')).status()).toBe(404);

  test.skip(!hasPhp, 'Sem PHP: o formulário do plugin não é gerado.');
  const pageUrl = `${new URL(page.url()).origin}/analise/${settings.token}`;
  const rendered = spawnSync('php', [join(WP, 'tests/render-harness.php'), JSON.stringify({ page_url: pageUrl }), JSON.stringify({ title: 'Quer saber o que falha no seu site?', success_title: 'Obrigado!', promo_hide_form_title: '0' })], { encoding: 'utf8' });
  expect(rendered.stderr).toBe('');
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Site WordPress</title><link rel="stylesheet" href="/form.css"></head><body style="background:#0d0d0d;padding:24px">${rendered.stdout}<script src="/form.js"></script></body></html>`;
  const wp = http.createServer((req, r) => {
    const file = req.url === '/form.css' ? 'form.css' : req.url === '/form.js' ? 'form.js' : null;
    if (file) {
      r.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/javascript' });
      r.end(readFileSync(join(WP, 'vndesign-analise-gratis/assets', file)));
      return;
    }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(html);
  });
  await new Promise<void>((resolve) => wp.listen(0, '127.0.0.1', resolve));
  const { server, url } = await localSite();
  try {
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pub = await visitor.newPage();
    await pub.goto(`http://127.0.0.1:${(wp.address() as AddressInfo).port}/`);
    await expect(pub.getByRole('heading', { name: 'Quer saber o que falha no seu site?' })).toBeVisible();
    // Validação no próprio site.
    await pub.getByRole('button', { name: 'Analisar o meu site' }).click();
    await expect(pub.getByText('Escreva o endereço do site.')).toBeVisible();
    await expect(pub.getByText('Aceite que o contactemos com a análise.')).toBeVisible();
    // Erro vindo da plataforma, junto do campo.
    await pub.getByLabel('Endereço do site').fill('isto não é um site');
    await pub.getByLabel('Email para receber a análise').fill(`wp@padaria-wp-${run}.pt`);
    await pub.getByRole('checkbox').check();
    await pub.getByRole('button', { name: 'Analisar o meu site' }).click();
    await expect(pub.getByText(/Endereço inválido/)).toBeVisible();
    // Certo: mensagem de sucesso e o lead quente.
    await pub.getByLabel('Endereço do site').fill(url);
    await pub.getByLabel('Nome do negócio').fill(`Padaria WP ${run}`);
    await pub.getByRole('button', { name: 'Analisar o meu site' }).click();
    await expect(pub.getByRole('status')).toContainText('Obrigado!');
    await visitor.close();
    const leads = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Padaria WP ${run}`)}`)).json()).data as { id: string; status: string; next_action_text: string }[];
    expect(leads[0]).toMatchObject({ status: 'respondeu', next_action_text: 'Ligar: pediu a análise grátis do site' });
    await page.request.delete(`/api/v1/leads/${leads[0]!.id}`);
  } finally {
    server.close();
    wp.close();
  }
});
