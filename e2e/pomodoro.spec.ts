import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Pomodoro: começar numa tarefa, pausar e continuar, a pausa, o aviso no fim
 * da fase, o cron (com a app fechada), a ligação ao temporizador ▶ e as
 * estatísticas. Para não esperar 25 minutos, o fim das fases acerta-se pela
 * base de dados (chave de servidor do .env.local).
 */
const run = Date.now().toString(36);

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

/** Muda o fim da fase do pomodoro do utilizador de teste (como se o tempo tivesse passado). */
async function setEndsAt(request: APIRequestContext, endsAt: Date) {
  const res = await request.patch(`${localEnv('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/pomodoro_timers?ends_at=not.is.null`, {
    headers: { apikey: localEnv('SUPABASE_SECRET_KEY'), Authorization: `Bearer ${localEnv('SUPABASE_SECRET_KEY')}`, Prefer: 'return=minimal' },
    data: { ends_at: endsAt.toISOString() },
  });
  expect(res.status(), await res.text()).toBe(204);
}

async function createProject(request: APIRequestContext, name: string) {
  const res = await request.post('/api/v1/leads?force=true', { data: { company_name: name, status: 'cliente' } });
  expect(res.status(), await res.text()).toBe(201);
  const lead = (await res.json()).data as { id: string };
  const task = await request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: 'Montar a página inicial' } });
  expect(task.status()).toBe(201);
  return lead;
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }) => {
  // Um utilizador, um pomodoro: começa cada teste sem nenhum.
  await request.post('/api/v1/pomodoro/action', { data: { action: 'stop' } });
  const saved = await request.patch('/api/v1/settings', {
    data: { pomodoro: { work_minutes: 25, short_break_minutes: 5, long_break_minutes: 15, long_every: 4, sound: false } },
  });
  expect(saved.status(), await saved.text()).toBe(200);
});

test('pomodoro na ficha: tarefa, pausar, continuar, fim do trabalho com aviso, pausa e parar', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createProject(page.request, `Pomodoro ${run}`);
  const before = ((await (await page.request.get('/api/v1/stats/pomodoros')).json()).data as { today: number }).today;
  await page.goto(`/leads/${lead.id}`);
  const box = page.locator('#projeto').getByRole('region', { name: 'Pomodoro' });
  await box.getByLabel('Em que tarefa?').selectOption({ label: 'Montar a página inicial' });
  await box.getByRole('button', { name: 'Começar 25 min' }).click();
  await expect(page.getByText('Pomodoro de 25 minutos a contar.')).toBeVisible();
  await expect(box).toContainText('A trabalhar');
  await expect(box).toContainText('Montar a página inicial');
  await expect(box.getByRole('timer')).toHaveText(/^2[45]:\d\d$/);
  // No menu, no lugar do temporizador.
  await expect(page.getByRole('status', { name: /Pomodoro: A trabalhar, Pomodoro/ }).first()).toBeVisible();

  await box.getByRole('button', { name: 'Pausar' }).click();
  await expect(box).toContainText('Em pausa');
  const frozen = await box.getByRole('timer').textContent();
  await page.waitForTimeout(1500);
  await expect(box.getByRole('timer')).toHaveText(frozen!);
  // Reiniciar: a fase volta ao início e conta logo.
  await box.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(page.getByText('A fase recomeçou do início.')).toBeVisible();
  await expect(box.getByRole('timer')).toHaveText(/^2[45]:\d\d$/);
  await box.getByRole('button', { name: 'Pausar' }).click();
  await box.getByRole('button', { name: 'Continuar' }).click();
  await expect(box).toContainText('A trabalhar');

  // O tempo de trabalho acaba daqui a 12 s (com a página já aberta): a app avisa e passa à pausa.
  await setEndsAt(page.request, new Date(Date.now() + 12_000));
  await page.reload();
  await expect(box.getByRole('timer')).toHaveText(/^00:(0\d|1[0-2])$/);
  await expect(page.getByText('Pomodoro terminado', { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(box).toContainText('Pausa');
  await expect(box).toContainText(`Hoje: ${before + 1}`);

  // O trabalho ficou nas horas do projeto, com a tarefa.
  const time = (await (await page.request.get(`/api/v1/leads/${lead.id}/time`)).json()).data as { entries: { notes: string | null; ended_at: string | null }[] };
  expect(time.entries.length).toBeGreaterThanOrEqual(2);
  expect(time.entries.every((e) => e.notes === 'Pomodoro · Montar a página inicial' && e.ended_at)).toBe(true);

  await box.getByRole('button', { name: 'Saltar pausa' }).click();
  await expect(box).toContainText('Pausa terminada');
  await expect(box.getByRole('button', { name: 'Começar o próximo' })).toBeVisible();

  // Descanso forçado de 5 minutos (também a meio do trabalho).
  await box.getByRole('button', { name: 'Começar o próximo' }).click();
  await expect(box).toContainText('A trabalhar');
  await box.getByRole('button', { name: 'Pausa de 5 min' }).click();
  await expect(page.getByText('Pausa de 5 minutos.')).toBeVisible();
  await expect(box.getByRole('timer')).toHaveText(/^0[45]:\d\d$/);
  await expect(box.getByRole('button', { name: 'Saltar pausa' })).toBeVisible();
  const forced = (await (await page.request.get('/api/v1/pomodoro')).json()).data as { phase: string; completed: number };
  expect(forced).toMatchObject({ phase: 'short_break', completed: 1 });

  await box.getByRole('button', { name: 'Parar' }).click();
  await expect(box.getByRole('button', { name: 'Começar 25 min' })).toBeVisible();
  expect((await (await page.request.get('/api/v1/pomodoro')).json()).data).toBeNull();
});

test('pomodoro com a app fechada: o cron avança, fecha as horas e a pausa longa vem ao 4.º', async ({ request }) => {
  const lead = await createProject(request, `Pomodoro cron ${run}`);
  const started = await request.post('/api/v1/pomodoro', { data: { lead_id: lead.id } });
  expect(started.status(), await started.text()).toBe(201);
  // Três pomodoros feitos "à pressa" (skip = acabar já) para chegar ao 4.º.
  for (let i = 0; i < 3; i++) {
    await request.post('/api/v1/pomodoro/action', { data: { action: 'skip' } }); // trabalho → pausa
    await request.post('/api/v1/pomodoro/action', { data: { action: 'skip' } }); // pausa → à espera
    expect((await request.post('/api/v1/pomodoro', { data: { lead_id: lead.id } })).status()).toBe(201);
  }
  await setEndsAt(request, new Date(Date.now() - 60_000));
  const cron = await request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${localEnv('CRON_SECRET')}` } });
  expect(cron.status(), await cron.text()).toBe(200);
  expect((await cron.json()).pomodoros.advanced).toBeGreaterThanOrEqual(1);

  const state = (await (await request.get('/api/v1/pomodoro')).json()).data as { phase: string; completed: number; today: number };
  expect(state.phase).toBe('long_break');
  expect(state.completed).toBe(4);
  expect(state.today).toBeGreaterThanOrEqual(4);
  const time = (await (await request.get(`/api/v1/leads/${lead.id}/time`)).json()).data as { running: unknown; entries: unknown[] };
  expect(time.running).toBeNull();
  expect(time.entries).toHaveLength(4);

  const stats = (await (await request.get('/api/v1/stats/pomodoros')).json()).data as { today: number; by_project: { lead: { id: string }; count: number }[] };
  expect(stats.today).toBeGreaterThanOrEqual(4);
  expect(stats.by_project.find((p) => p.lead.id === lead.id)?.count).toBe(4);
});

test('pomodoro e temporizador ▶: pausar o temporizador pausa o pomodoro; começar o ▶ termina-o', async ({ request }) => {
  const lead = await createProject(request, `Pomodoro timer ${run}`);
  expect((await request.post('/api/v1/pomodoro', { data: { lead_id: lead.id } })).status()).toBe(201);
  expect((await request.post('/api/v1/time/stop')).status()).toBe(200);
  const paused = (await (await request.get('/api/v1/pomodoro')).json()).data as { phase: string; paused_left: number | null };
  expect(paused.phase).toBe('work');
  expect(paused.paused_left).toBeGreaterThan(1400);

  expect((await request.post(`/api/v1/leads/${lead.id}/time/start`, { data: {} })).status()).toBe(201);
  expect((await (await request.get('/api/v1/pomodoro')).json()).data).toBeNull();
  await request.post('/api/v1/time/stop');

  // A tarefa tem de ser do projeto.
  const other = await createProject(request, `Pomodoro outro ${run}`);
  const tasks = (await (await request.get(`/api/v1/leads/${other.id}/tasks`)).json()).data as { id: string }[];
  expect((await request.post('/api/v1/pomodoro', { data: { lead_id: lead.id, task_id: tasks[0]!.id } })).status()).toBe(404);
});

test('definições e estatísticas do pomodoro', async ({ page }) => {
  await page.goto('/definicoes/funcionalidades');
  const card = page.getByRole('heading', { name: 'Pomodoro', exact: true }).locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
  await card.getByLabel('Trabalho (min)').fill('50');
  await card.getByLabel('Pausa (min)', { exact: true }).fill('10');
  await card.getByRole('button', { name: 'Guardar tempos' }).click();
  await expect(page.getByText(/Tempos do Pomodoro guardados/)).toBeVisible();
  const settings = (await (await page.request.get('/api/v1/settings')).json()).data as { pomodoro: { work_minutes: number; short_break_minutes: number } };
  expect(settings.pomodoro).toMatchObject({ work_minutes: 50, short_break_minutes: 10 });

  await page.goto('/estatisticas');
  await expect(page.getByRole('heading', { name: 'Pomodoro', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pomodoros por dia' })).toBeVisible();
});
