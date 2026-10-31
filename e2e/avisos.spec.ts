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
  expect(item).toMatchObject({ kind: 'reminder', text: 'Lembrete da tarefa' });
  expect(item?.url).toMatch(/^\/leads\/.+#tarefas$/);

  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Avisos/ }).first().click();
  await page.getByRole('menuitem', { name: new RegExp(`^Ligar ao Sino ${run}`) }).click();
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

test('sino: cor e etiqueta por tipo, ações rápidas, apagar um aviso, apagar os lidos e limpar todos (com Anular)', async ({ page }) => {
  await page.request.put('/api/v1/preferences/notifications.alerts', { data: { value: { off: [] } } });
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Limpar Sino ${run}` } })).json()).data as { id: string };
  for (const t of ['Um', 'Dois', 'Tres', 'Adiar']) await remindNow(page.request, lead.id, `${t} Sino ${run}`);
  const titles = async () => (await bell(page.request)).map((n) => n.title ?? '');

  await page.goto('/dashboard');
  const button = page.getByRole('button', { name: /^Avisos/ }).first();
  await button.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByText(/\d+ por ler$/).first()).toBeVisible();
  await expect(menu.getByRole('group', { name: 'Hoje' })).toBeVisible();
  // Sem emoji e sem "Lembrete da tarefa": no nome, depois do título, a etiqueta "Lembrete", o lead e "há … min" (no ecrã, por cima).
  const um = menu.getByRole('menuitem', { name: new RegExp(`^Um Sino ${run} \\(por ler\\) Lembrete #\\d+ Limpar Sino ${run} (agora mesmo|há \\d+ min)$`) });
  await expect(um).toBeVisible();
  await page.screenshot({ path: 'test-results/sino.png' });

  // Apagar um (o menu fica aberto).
  await menu.getByRole('menuitem', { name: `Apagar aviso: Dois Sino ${run}` }).click();
  await expect(menu.getByRole('menuitem', { name: new RegExp(`Dois Sino ${run}`) })).toHaveCount(0);
  await expect.poll(async () => (await titles()).includes(`⏰ Dois Sino ${run}`)).toBe(false);

  // Ações rápidas do lembrete: "Feita" conclui a tarefa; "Adiar 1 h" volta a pôr o lembrete (daqui a 1 hora).
  const tasks = async () => (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; done_at: string | null; remind_at: string | null }[];
  const row = (name: string) => menu.getByRole('group', { name: 'Hoje' }).locator('div.group\\/aviso').filter({ hasText: name });
  await row(`Tres Sino ${run}`).getByRole('menuitem', { name: 'Feita' }).click();
  await expect.poll(async () => (await tasks()).find((t) => t.title === `Tres Sino ${run}`)?.done_at).toBeTruthy();
  await expect(menu.getByRole('menuitem', { name: new RegExp(`^Tres Sino ${run}`) })).toHaveCount(0);
  await row(`Adiar Sino ${run}`).getByRole('menuitem', { name: 'Adiar 1 h' }).click();
  await expect
    .poll(async () => Date.parse((await tasks()).find((t) => t.title === `Adiar Sino ${run}`)?.remind_at ?? '0') - Date.now())
    .toBeGreaterThan(50 * 60_000);
  await expect(menu.getByRole('menuitem', { name: new RegExp(`^Adiar Sino ${run}`) })).toHaveCount(0);

  // Marcar todos como lidos (o sino fica aberto); "Apagar os lidos" tira-os logo e só apaga passados 5 s ("Anular" volta atrás).
  await menu.getByRole('menuitem', { name: 'Marcar todos como lidos' }).click();
  await expect(menu.getByText(/Tudo lido$/).first()).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: new RegExp(`^Um Sino ${run} Lembrete`) })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Apagar os lidos' }).click();
  await button.click();
  await expect(menu.getByRole('menuitem', { name: new RegExp(`Um Sino ${run}`) })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('[data-sonner-toast]').filter({ hasText: 'Avisos lidos apagados.' }).getByRole('button', { name: 'Anular' }).click();
  await button.click();
  await expect(menu.getByRole('menuitem', { name: new RegExp(`^Um Sino ${run}`) })).toBeVisible();
  await page.waitForTimeout(6000);
  expect((await titles()).includes(`⏰ Um Sino ${run}`)).toBe(true);
  await menu.getByRole('menuitem', { name: 'Apagar os lidos' }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => (await titles()).some((t) => t.includes(`Sino ${run}`)), { timeout: 15_000 }).toBe(false);

  // Limpar todos (também os por ler).
  await remindNow(page.request, lead.id, `Quatro Sino ${run}`);
  await page.reload();
  await button.click();
  await menu.getByRole('menuitem', { name: 'Limpar todos' }).click();
  await expect.poll(async () => (await bell(page.request)).length, { timeout: 15_000 }).toBe(0);

  await button.click();
  // Vazio: "Tudo em dia" com o atalho para escolher os avisos.
  await expect(menu.getByText('Tudo em dia')).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Escolher os avisos' })).toBeVisible();
});

test('sino no telemóvel: painel de baixo para cima com botões grandes', async ({ page }) => {
  await page.request.put('/api/v1/preferences/notifications.alerts', { data: { value: { off: [] } } });
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Painel Sino ${run}` } })).json()).data as { id: string };
  await remindNow(page.request, lead.id, `Painel Sino ${run}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Avisos/ }).last().click();
  const sheet = page.getByRole('dialog', { name: 'Avisos' });
  await expect(sheet.getByRole('button', { name: new RegExp(`^Painel Sino ${run} \\(por ler\\)`) })).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
  const feita = sheet.getByRole('button', { name: 'Feita' }).first();
  expect((await feita.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await page.screenshot({ path: 'test-results/sino-telemovel.png' });
  await sheet.getByRole('button', { name: new RegExp(`^Painel Sino ${run}`) }).click();
  await expect(page).toHaveURL(/\/leads\/.+#tarefas$/, { timeout: 30_000 });
  await expect(sheet).toHaveCount(0);
});
