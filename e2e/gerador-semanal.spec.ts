import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Gerador de leads automático (semanal): criar e ligar/desligar na página, e o
 * cron a lançar a pesquisa que chegou à hora (servidor falso de IA em e2e/stubs.ts).
 */
const run = Date.now().toString(36);
const MAILPIT = 'http://127.0.0.1:54324/api/v1';
let stop: () => void;

/** Variáveis do apps/web/.env.local (para pôr uma pesquisa "à hora" diretamente na base de dados). */
function localEnv(name: string): string | undefined {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function makeDue(request: APIRequestContext, id: string) {
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY');
  const res = await request.patch(`${url}/rest/v1/lead_generation_schedules?id=eq.${id}`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: { next_run_at: new Date(Date.now() - 60_000).toISOString() },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

async function deleteAllSchedules(page: Page) {
  const list = (await (await page.request.get('/api/v1/lead-generation/schedules')).json()).data as { id: string }[];
  for (const s of list) await page.request.delete(`/api/v1/lead-generation/schedules/${s.id}`);
}

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await deleteAllSchedules(page);
  await page.close();
  stop?.();
});

test('criar a partir da pesquisa, ligar e desligar no interruptor', async ({ page }) => {
  await deleteAllSchedules(page);
  await page.goto('/gerar-leads');
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Pesquisas automáticas' }) });
  await expect(card.getByText('Ainda não tens pesquisas automáticas.')).toBeVisible();

  await page.getByLabel('O que procuras?').fill(`oficinas sem site ${run}`);
  await page.getByRole('button', { name: 'Repetir todas as semanas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova pesquisa automática' });
  // A pesquisa já vem preenchida.
  await expect(dialog.getByLabel('O que procuras?')).toHaveValue(`oficinas sem site ${run}`);
  await dialog.getByLabel('Dia da semana').selectOption({ label: 'Quarta-feira' });
  await dialog.getByLabel('Hora').selectOption({ label: '09:00' });
  await dialog.getByLabel('Adicionar logo as empresas novas como leads').check();
  await dialog.getByRole('button', { name: 'Criar pesquisa automática' }).click();
  await expect(page.getByText(/Pesquisa automática criada\. A primeira corre a \d{2}\/\d{2}/)).toBeVisible();

  const row = card.getByRole('listitem').filter({ hasText: `oficinas sem site ${run}` });
  await expect(row.getByText('Quarta-feira às 09:00')).toBeVisible();
  await expect(row.getByText('Adiciona os leads sozinha')).toBeVisible();
  await expect(row.getByText(/^Próxima: \d{2}\/\d{2} às 09:00$/)).toBeVisible();

  const toggle = row.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.getByText('Pesquisa automática desativada.')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(row.getByText('Desativada', { exact: true })).toBeVisible();
  let saved = (await (await page.request.get('/api/v1/lead-generation/schedules')).json()).data[0];
  expect(saved).toMatchObject({ enabled: false, next_run_at: null, weekday: 3, hour: 9, auto_add: true });

  await toggle.click();
  await expect(page.getByText(/Pesquisa automática ativada\. Próxima: \d{2}\/\d{2} às 09:00/)).toBeVisible();
  saved = (await (await page.request.get('/api/v1/lead-generation/schedules')).json()).data[0];
  expect(saved.enabled).toBe(true);
  expect(new Date(saved.next_run_at).getTime()).toBeGreaterThan(Date.now());

  // Editar: passa a ficar para rever.
  await row.getByRole('button', { name: `Mais ações: oficinas sem site ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar pesquisa automática' });
  await edit.getByLabel('Guardar a lista para eu rever').check();
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(row.getByText('Fica para rever')).toBeVisible();
});

test('o cron lança a pesquisa que chegou à hora, adiciona os leads novos e avisa por email', async ({ page, request }) => {
  test.skip(!process.env.CRON_SECRET, 'Sem CRON_SECRET em apps/web/.env.local');
  await deleteAllSchedules(page);
  // Nome comprido e aleatório: as empresas do servidor falso não ficam "parecidas" com as de outros testes
  // (as parecidas não entram sozinhas).
  const token = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('');
  const created = await page.request.post('/api/v1/lead-generation/schedules', {
    data: { query: `cafés semanais ${token}`, city: 'Amadora', auto_add: true, audit: false, weekday: 1, hour: 8 },
  });
  expect(created.status()).toBe(201);
  const schedule = (await created.json()).data;
  expect(new Date(schedule.next_run_at).getTime()).toBeGreaterThan(Date.now());

  // Antes da hora, o cron não faz nada.
  const auth = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
  const idle = (await (await request.get('/api/v1/cron/reminders', { headers: auth })).json()).lead_generation;
  expect(idle.find((r: { schedule_id: string }) => r.schedule_id === schedule.id)).toBeUndefined();

  await makeDue(request, schedule.id);
  const cron = await request.get('/api/v1/cron/reminders', { headers: auth });
  expect(cron.status()).toBe(200);
  const started = (await cron.json()).lead_generation.find((r: { schedule_id: string }) => r.schedule_id === schedule.id);
  expect(started.status).toBe('started');

  // Uma segunda passagem do cron não volta a lançar a mesma pesquisa.
  const again = (await (await request.get('/api/v1/cron/reminders', { headers: auth })).json()).lead_generation;
  expect(again.find((r: { schedule_id: string }) => r.schedule_id === schedule.id)).toBeUndefined();

  // A pesquisa termina e as empresas novas entram sozinhas como leads.
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/lead-generation/${started.run_id}`)).json()).data.auto_added, { timeout: 45_000 })
    .toBeGreaterThan(0);
  const finished = (await (await page.request.get(`/api/v1/lead-generation/${started.run_id}`)).json()).data;
  expect(finished.schedule_id).toBe(schedule.id);
  expect(finished.candidates.filter((c: { added_lead_id: string | null }) => c.added_lead_id)).toHaveLength(finished.auto_added);
  const leads = (await (await page.request.get('/api/v1/leads', { params: { q: `Café Central ${token}` } })).json()).data;
  expect(leads).toHaveLength(1);

  const after = (await (await page.request.get('/api/v1/lead-generation/schedules')).json()).data[0];
  expect(after.last_run_id).toBe(started.run_id);
  expect(new Date(after.next_run_at).getTime()).toBeGreaterThan(Date.now());
  expect(after.checked_at).not.toBeNull();

  // Aviso por email (SMTP do servidor = Mailpit), com o link para a pesquisa.
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`subject:"do gerador semanal"`)}`);
        const messages = ((await res.json()).messages ?? []) as { ID: string; Snippet: string }[];
        return messages.some((m) => m.Snippet.includes(`cafés semanais ${token}`));
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  // O link do aviso abre a pesquisa, marcada como automática.
  await page.goto(`/gerar-leads?pesquisa=${started.run_id}`);
  const result = page.locator('#pesquisa-atual');
  await expect(result.getByRole('heading', { name: `cafés semanais ${token}` })).toBeVisible();
  await expect(result.getByText('Automática')).toBeVisible();
  await expect(result.getByText(/adicionado\(s\) automaticamente/)).toBeVisible();
  await expect(page.getByText('Agendador ativo')).toBeVisible();
});

test('“Correr agora” abre o resultado na página', async ({ page }) => {
  await deleteAllSchedules(page);
  await page.request.post('/api/v1/lead-generation/schedules', { data: { query: `padarias agora ${run}`, weekday: 5, hour: 18 } });
  await page.goto('/gerar-leads');
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Pesquisas automáticas' }) });
  await card.getByRole('button', { name: `Mais ações: padarias agora ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Correr agora' }).click();
  await expect(page.getByText('A pesquisar… o resultado aparece abaixo')).toBeVisible();
  const result = page.locator('#pesquisa-atual');
  await expect(result.getByRole('list', { name: 'Empresas encontradas' })).toBeVisible({ timeout: 45_000 });
  await expect(result.getByText('Automática')).toBeVisible();
  // Fica para rever: nada foi adicionado sozinho.
  await expect(result.getByRole('button', { name: /^Adicionar \d+ leads?$/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /Ver a última pesquisa/ })).toBeVisible();

  // Ao voltar à página, a última pesquisa aparece identificada e fechada; abre-se no botão.
  await page.reload();
  await expect(result.getByText('Última pesquisa', { exact: true })).toBeVisible();
  await expect(result.getByRole('list', { name: 'Empresas encontradas' })).toBeHidden();
  await result.getByRole('button', { name: 'Ver empresas' }).click();
  await expect(result.getByRole('list', { name: 'Empresas encontradas' })).toBeVisible();
  await result.getByRole('button', { name: 'Esconder' }).click();
  await expect(result.getByRole('list', { name: 'Empresas encontradas' })).toBeHidden();
});
