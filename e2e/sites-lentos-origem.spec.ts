import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, request as playwrightRequest, test } from '@playwright/test';

/*
 * Site do cliente lento (pelo histórico das verificações): aviso no sino e a tarefa
 * "Propor otimização…". E a origem de cada lead na ficha e no filtro da lista.
 */
const run = Date.now().toString(36);

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

test('Site do cliente lento: aviso no sino e a tarefa "Propor otimização" (uma vez)', async ({ page }) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>Olá</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  const supabase = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY');
  const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` } });
  try {
    const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Lento ${run}`, status: 'cliente' } })).json()).data as { id: string };
    const monitor = (await (await page.request.post(`/api/v1/leads/${lead.id}/site-monitor`, { data: { url } })).json()).data as { id: string };
    const ws = (await (await admin.get(`${supabase}/rest/v1/site_monitors?id=eq.${monitor.id}&select=workspace_id`)).json()) as { workspace_id: string }[];
    // Histórico: 3 semanas a 1 s e a última semana a 4 s (de 4 em 4 horas).
    const now = Date.now();
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => ({ at: now - (8 + i * 0.4) * 86_400_000, ms: 1000 })),
      ...Array.from({ length: 30 }, (_, i) => ({ at: now - (0.2 + i * 0.2) * 86_400_000, ms: 4000 })),
    ].map((r) => ({ workspace_id: ws[0]!.workspace_id, monitor_id: monitor.id, checked_at: new Date(r.at).toISOString(), ok: true, down: false, response_ms: r.ms, status_code: 200 }));
    expect((await admin.post(`${supabase}/rest/v1/site_monitor_checks`, { data: rows })).status()).toBe(201);
    // Verificar já no cron (as verificações seguintes são de hora a hora).
    expect((await admin.patch(`${supabase}/rest/v1/site_monitors?id=eq.${monitor.id}`, { data: { next_check_at: new Date(now - 60_000).toISOString() } })).status()).toBe(204);
    const cron = await page.request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${localEnv('CRON_SECRET')}` } });
    expect(cron.status(), await cron.text()).toBe(200);

    const title = `Propor otimização a Lento ${run}: o site passou de 1,0 s para 4,0 s a responder (última semana)`;
    const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string }[];
    expect(tasks.map((t) => t.title)).toContain(title);
    const bell = (await (await page.request.get('/api/v1/notifications')).json()).data as { title: string | null }[];
    expect(bell.some((n) => n.title === `🐢 Site lento: Lento ${run}`)).toBe(true);

    // No mesmo dia (e nos 30 seguintes) não volta a avisar.
    await admin.patch(`${supabase}/rest/v1/site_monitors?id=eq.${monitor.id}`, { data: { next_check_at: new Date(now - 60_000).toISOString() } });
    await page.request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${localEnv('CRON_SECRET')}` } });
    const again = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string }[];
    expect(again.filter((t) => t.title.startsWith('Propor otimização'))).toHaveLength(1);
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  } finally {
    await admin.dispose();
    server.close();
  }
});

test('Origem do lead: na ficha e no filtro "Origem" da lista', async ({ page }) => {
  const manual = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Origem Mão ${run}` } })).json()).data as { id: string; origin: string | null };
  expect(manual.origin).toBe('manual');
  await page.goto(`/leads/${manual.id}`);
  await expect(page.getByText('Criado à mão')).toBeVisible();

  // Filtro: só os criados à mão (aparece) vs. só os da análise grátis (não aparece).
  await page.goto(`/leads?q=${encodeURIComponent(`Origem Mão ${run}`)}&origem=manual`);
  await expect(page.getByRole('link', { name: new RegExp(`Origem Mão ${run}`) }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tirar o filtro Origem: Criado à mão' })).toBeVisible();
  const onlyAudit = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Origem Mão ${run}`)}&origin=free_audit`)).json()) as { meta: { total: number } };
  expect(onlyAudit.meta.total).toBe(0);
  const onlyManual = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Origem Mão ${run}`)}&origin=manual`)).json()) as { meta: { total: number } };
  expect(onlyManual.meta.total).toBe(1);
  await page.request.delete(`/api/v1/leads/${manual.id}`);
});
