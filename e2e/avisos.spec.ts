import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Sino dos avisos: além das tarefas atribuídas e das menções, os lembretes (e
 * os outros alertas) ficam no sino, com o link certo; cada tipo desliga-se em
 * Definições → Follow-up e lembretes.
 */
const run = Date.now().toString(36);

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

type Item = { kind: string; title: string | null; text: string; url: string | null };
const bell = async (request: APIRequestContext) => (await (await request.get('/api/v1/notifications')).json()).data as Item[];

async function remindNow(request: APIRequestContext, leadId: string, title: string) {
  const past = new Date(Date.now() - 60_000).toISOString();
  const res = await request.post(`/api/v1/leads/${leadId}/tasks`, { data: { title, remind_at: past } });
  expect(res.status(), await res.text()).toBe(201);
  const cron = await request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${localEnv('CRON_SECRET')}` } });
  expect(cron.status(), await cron.text()).toBe(200);
}

test.afterEach(async ({ request }) => {
  await request.put('/api/v1/preferences/notifications.alerts', { data: { value: { off: [] } } });
});

test('lembrete no sino: abre a ficha nas tarefas; desligar "Lembretes" nas Definições', async ({ page }) => {
  await page.request.put('/api/v1/preferences/notifications.alerts', { data: { value: { off: [] } } });
  const res = await page.request.post('/api/v1/leads', { data: { company_name: `Aviso Sino ${run}` } });
  const lead = (await res.json()).data as { id: string; number: number };

  await remindNow(page.request, lead.id, `Ligar ao Sino ${run}`);
  const item = (await bell(page.request)).find((n) => n.title === `⏰ Ligar ao Sino ${run}`);
  expect(item).toMatchObject({ kind: 'reminder', text: `Lembrete · #${lead.number} Aviso Sino ${run}` });
  expect(item?.url).toMatch(/^\/leads\/.+#tarefas$/);

  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Avisos/ }).first().click();
  await page.getByRole('menuitem', { name: new RegExp(`Ligar ao Sino ${run}`) }).click();
  await expect(page).toHaveURL(/\/leads\/.+#tarefas$/, { timeout: 30_000 });

  // Desligar os lembretes: o próximo já não vai para o sino.
  await page.goto('/definicoes/lembretes');
  const kinds = page.getByTestId('alert-kinds');
  await kinds.getByRole('switch', { name: 'Desligar os avisos: Lembretes' }).click();
  await expect(kinds.getByRole('switch', { name: 'Ligar os avisos: Lembretes' })).toBeVisible();
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/preferences/notifications.alerts')).json()).data.value)
    .toEqual({ off: ['reminder'] });
  await remindNow(page.request, lead.id, `Sem Sino ${run}`);
  expect((await bell(page.request)).some((n) => n.title === `⏰ Sem Sino ${run}`)).toBe(false);
});
