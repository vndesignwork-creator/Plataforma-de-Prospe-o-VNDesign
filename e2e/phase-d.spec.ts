import { expect, request, test } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * Fase D. O auditor precisa de AUDIT_ALLOW_PRIVATE=1 e AUDIT_SKIP_PAGESPEED=1
 * no servidor (apps/web/.env.local) para poder analisar um site local.
 */
const run = Date.now().toString(36);

let site: http.Server;
let siteUrl = '';

test.beforeAll(async () => {
  site = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(301, { location: '/inicio' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>Oficina Antiga</title>
      <meta name="generator" content="WordPress 4.7"></head>
      <body><h1>Oficina</h1><footer>&copy; 2017 Oficina Antiga</footer></body></html>`);
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}/`;
});

test.afterAll(() => {
  site.close();
});

test('analisar o site de um lead e aplicar os resultados', async ({ page }) => {
  const name = `Oficina Auditada ${run}`;
  // O website (127.0.0.1) repete-se entre execuções: force=true evita o 409 de duplicado.
  const res = await page.request.post('/api/v1/leads?force=true', { data: { company_name: name, website: siteUrl } });
  expect(res.status()).toBe(201);
  const lead = (await res.json()).data;

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Analisar site' }).click();
  await expect(page.getByText(/Análise concluída: \d+ problema/)).toBeVisible({ timeout: 30_000 });

  const audit = page.getByRole('region', { name: 'Análise automática do site' });
  await expect(audit.getByText('Sem HTTPS', { exact: true })).toBeVisible();
  await expect(audit.getByText('Não adaptado a telemóvel')).toBeVisible();
  await expect(audit.getByText('Título: “Oficina Antiga”')).toBeVisible();
  await expect(audit.getByText(/Plataforma: WordPress 4\.7 · © 2017/)).toBeVisible();
  await expect(audit.getByText('O rodapé diz © 2017 — o site parece não ter manutenção.')).toBeVisible();

  await audit.getByRole('button', { name: 'Aplicar ao lead' }).click();
  await expect(page.getByText('Resultados aplicados ao lead.')).toBeVisible();
  await expect(page.getByText('Sem HTTPS; Não é responsivo; Sem meta descrição; Copyright de 2017').first()).toBeVisible();

  const timeline = page.getByLabel('Atividade do lead');
  await expect(timeline.getByText('Site analisado')).toBeVisible();
  await expect(timeline.getByText('Lead editado')).toBeVisible();

  // Endereços internos/protocolos estranhos são recusados pela API.
  const bad = await page.request.post(`/api/v1/leads/${lead.id}/audits`, { data: { url: 'ftp://exemplo.pt' } });
  expect(bad.status()).toBe(422);
});

test('token de integração: criar, importar leads (dry run, idempotência) e revogar', async ({ page, baseURL }) => {
  await page.goto('/definicoes#api');
  const card = page.locator('#api');
  await card.getByLabel('Nome do token').fill(`Teste E2E ${run}`);
  await card.getByRole('button', { name: 'Criar token' }).click();
  const dialog = page.getByRole('dialog', { name: 'Token criado' });
  const token = (await dialog.locator('code').first().textContent())!.trim();
  expect(token).toMatch(/^vnd_[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole('button', { name: 'Já copiei' }).click();
  await expect(card.getByText(`Teste E2E ${run}`)).toBeVisible();

  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  const company = `Importado API ${run}`;
  const payload = {
    source: 'claude-semanal',
    leads: [
      { company_name: company, sector: '🍽️ Restauração', website: `https://api-${run}.pt`, pagespeed: 41, mobile: 'Não', status: '🔍 Identificado' },
      { company_name: company, website: `https://api-${run}.pt` },
      { website: 'sem-nome.pt' },
    ],
  };

  const dry = await api.post('/api/v1/leads/import', { data: { ...payload, dry_run: true } });
  expect(dry.status()).toBe(200);
  expect((await dry.json()).data.summary).toMatchObject({ total: 3, created: 1, skipped_duplicate: 1, invalid: 1 });

  const key = `semana-${run}`;
  const first = await api.post('/api/v1/leads/import', { data: payload, headers: { 'Idempotency-Key': key } });
  expect(first.status()).toBe(201);
  const firstBody = (await first.json()).data;
  expect(firstBody.results[0]).toMatchObject({ result: 'created', would: false });
  expect(firstBody.results[0].number).toBeGreaterThan(0);

  const replay = await api.post('/api/v1/leads/import', { data: payload, headers: { 'Idempotency-Key': key } });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data).toMatchObject({ replayed: true, job_id: firstBody.job_id });

  const again = await api.post('/api/v1/leads/import', { data: payload });
  expect((await again.json()).data.summary).toMatchObject({ created: 0, skipped_duplicate: 2 });

  // Scopes: o token por omissão só importa.
  expect((await api.get('/api/v1/leads')).status()).toBe(403);
  expect((await api.get('/api/v1/tokens')).status()).toBe(403);

  // O lead aparece na lista, com a atividade "via API".
  await page.goto('/leads');
  await page.getByLabel('Pesquisar leads').fill(company);
  await page.getByRole('link', { name: company }).click();
  await expect(page.getByLabel('Atividade do lead').getByText(/via API/).first()).toBeVisible();

  // Revogar
  await page.goto('/definicoes#api');
  const row = page.locator('#api li').filter({ hasText: `Teste E2E ${run}` });
  await row.getByRole('button', { name: 'Revogar' }).click();
  await page.getByRole('dialog', { name: 'Revogar token?' }).getByRole('button', { name: 'Revogar' }).click();
  await expect(row.getByText('Revogado')).toBeVisible();
  expect((await api.post('/api/v1/leads/import', { data: payload })).status()).toBe(401);
  await api.dispose();
});

test('PWA: manifesto, service worker e página sem ligação', async ({ page, baseURL }) => {
  const anon = await request.newContext({ baseURL });
  const manifest = await anon.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ name: 'VNDesign Leads', lang: 'pt-PT', display: 'standalone' });
  const sw = await anon.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toContain('javascript');
  expect((await anon.get('/icons/icon-192.png')).status()).toBe(200);
  const offline = await anon.get('/offline');
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain('Sem ligação à internet');
  await anon.dispose();

  await page.goto('/dashboard');
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? null), {
      timeout: 15_000,
    })
    .toContain('/sw.js');
});

test('notificações push: registar e remover um dispositivo pela API', async ({ page }) => {
  const status = await page.request.get('/api/v1/push-subscriptions');
  expect(status.status()).toBe(200);
  const { data } = await status.json();
  test.skip(!data.configured, 'VAPID não configurado neste ambiente');

  const endpoint = `https://push.exemplo.invalid/${run}`;
  const sub = { endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
  expect((await page.request.post('/api/v1/push-subscriptions', { data: sub })).status()).toBe(204);
  const after = (await (await page.request.get('/api/v1/push-subscriptions')).json()).data;
  expect(after.subscriptions.some((s: { endpoint: string }) => s.endpoint === endpoint)).toBe(true);
  expect((await page.request.delete('/api/v1/push-subscriptions', { data: { endpoint } })).status()).toBe(204);

  await page.goto('/definicoes#lembretes');
  await expect(page.getByRole('button', { name: 'Ativar notificações neste dispositivo' })).toBeVisible();
});
