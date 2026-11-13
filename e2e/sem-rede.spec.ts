import { expect, test } from '@playwright/test';

/*
 * Sem rede (telemóvel numa visita): o que se regista na página aberta fica guardado no aparelho
 * e é enviado sozinho, pela mesma ordem, quando a rede volta.
 */
const run = Date.now().toString(36);

test('sem rede: estado, chamada e tarefa ficam guardados e vão quando a rede volta', async ({ page, context }) => {
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Sem Rede ${run}`, phone: '912345678' } })).json()).data as {
    id: string;
    number: number;
  };
  await page.goto(`/leads/${lead.id}#tarefas`);
  await expect(page.getByRole('heading', { name: `Sem Rede ${run}` })).toBeVisible();
  const card = page.locator('#tarefas');
  await expect(card.getByLabel('Nova tarefa')).toBeVisible();

  await context.setOffline(true);
  try {
    const banner = page.getByRole('status', { name: 'Sem rede' });
    await expect(banner).toContainText('Sem rede.');

    // Estado: a ficha mostra já o novo.
    await page.getByLabel('Estado', { exact: true }).selectOption('respondeu');
    await expect(page.getByText(/Sem rede: ficou guardado neste aparelho/).first()).toBeVisible();
    await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('respondeu');

    // Chamada na linha do tempo.
    await page.getByRole('button', { name: 'Registar', exact: true }).first().click();
    const form = page.getByRole('form', { name: 'Registar contacto' });
    await form.getByLabel('Tipo de registo').selectOption('call_logged');
    await form.getByLabel('Texto do registo').fill(`Atendeu na loja ${run}`);
    await form.getByRole('button', { name: 'Registar' }).click();
    await expect(form).toHaveCount(0);

    // Tarefa nova.
    await card.getByLabel('Nova tarefa').fill(`Levar orçamento ${run}`);
    await card.getByLabel('Nova tarefa').press('Enter');

    await expect(page.getByTestId('outbox-count')).toHaveText('3 registos por enviar.');
    // Ainda nada no servidor.
    const before = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { status: string };
    expect(before.status).toBe('identificado');
  } finally {
    await context.setOffline(false);
  }

  // A rede volta: envia sozinho.
  await expect(page.getByText('Enviados 3 registos feitos sem rede.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status', { name: 'Sem rede' })).toHaveCount(0);
  const after = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { status: string };
  expect(after.status).toBe('respondeu');
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string; body: string | null }[];
  expect(activities.some((a) => a.type === 'call_logged' && a.body === `Atendeu na loja ${run}`)).toBe(true);
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string }[];
  expect(tasks.map((t) => t.title)).toContain(`Levar orçamento ${run}`);
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});

test('sem rede na Prospeção: o resultado fica guardado e vai quando a rede volta', async ({ page, context }) => {
  await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Prospeção Sem Rede ${run}`, phone: '912345671' } });
  // Modo "chamadas" (os botões do resultado à vista em cada linha); no fim, volta ao que estava.
  const previous = ((await (await page.request.get('/api/v1/preferences/prospecting.mode')).json()) as { data: { value: unknown } }).data.value ?? 'email';
  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'phone' } });
  await page.goto('/prospecao');
  const button = page.getByRole('button', { name: /^Contactado/ }).first();
  const hasQueue = await button.waitFor({ timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  test.skip(!hasQueue, 'Sem leads na fila de prospeção');

  await context.setOffline(true);
  try {
    await button.click();
    await expect(page.getByText(/Sem rede: ficou guardado neste aparelho/).first()).toBeVisible();
    await expect(page.getByTestId('outbox-count')).toHaveText('1 registo por enviar.');
  } finally {
    await context.setOffline(false);
  }
  await expect(page.getByText('Enviado 1 registo feito sem rede.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('outbox-count')).toHaveCount(0);
  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: previous } });
});
