import http from 'node:http';
import type { AddressInfo } from 'node:net';
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
    const settings = (await (await page.request.post('/api/v1/free-audit', { data: { enabled: true } })).json()).data as { token: string };
    expect(settings.token).toMatch(/^[\w-]{16,}$/);
    await page.goto('/definicoes/formulario');
    await expect(page.getByLabel('Endereço da página')).toContainText(`/analise/${settings.token}`);

    // A página pública (sem sessão).
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pub = await visitor.newPage();
    await pub.goto(`/analise/${settings.token}`);
    await expect(pub.getByRole('heading', { name: 'Analisar o meu site grátis' })).toBeVisible();
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
    await visitor.close();

    // O lead quente, com "Ligar" para hoje, e o email com o PDF em anexo.
    const leads = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Padaria Grátis ${run}`)}`)).json()).data as { id: string; status: string; next_action_text: string }[];
    expect(leads[0]).toMatchObject({ status: 'respondeu', next_action_text: 'Ligar: pediu a análise grátis do site' });
    const message = await mailTo(page.request, to);
    expect(message.Subject).toContain('A análise do site');
    expect(message.Attachments).toBe(1);

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
