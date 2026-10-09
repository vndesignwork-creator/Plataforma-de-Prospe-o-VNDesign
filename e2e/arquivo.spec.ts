import { expect, test } from '@playwright/test';

/* Arquivar, repor e apagar leads (ficha, lista com seleção múltipla e definições). */
const run = Date.now().toString(36);

test('arquivar na ficha: sai da lista, aparece no filtro de arquivados e repõe-se', async ({ page }) => {
  const name = `Arquiva Ficha ${run}`;
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: name, city: 'Amadora' } })).json()).data;

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByText(/Lead arquivado\./)).toBeVisible();
  await expect(page.getByText(/^Arquivado em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Arquivado', { exact: true })).toBeVisible();

  // Fora da lista normal…
  await page.goto(`/leads?q=${encodeURIComponent(name)}`);
  await expect(page.getByText('Nenhum lead com estes filtros')).toBeVisible();
  // …mas no filtro "Só os arquivados".
  await page.getByLabel('Leads arquivados').selectOption('only');
  await expect(page.getByRole('link', { name }).first()).toBeVisible();

  // Fora do Kanban.
  const board = await (await page.request.get(`/api/v1/board?q=${encodeURIComponent(name)}`)).json();
  expect(board.data.flatMap((c: { leads: unknown[] }) => c.leads)).toHaveLength(0);

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Repor' }).click();
  await expect(page.getByText('Lead reposto.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arquivar' })).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Reposto do arquivo')).toBeVisible();
});

test('lista: selecionar vários leads, arquivar, repor e apagar', async ({ page }) => {
  const prefix = `Lote ${run}`;
  for (const n of [1, 2, 3]) {
    const res = await page.request.post('/api/v1/leads', { data: { company_name: `${prefix} ${n}` } });
    expect(res.status()).toBe(201);
  }
  await page.goto(`/leads?q=${encodeURIComponent(prefix)}`);
  await expect(page.getByText('3 leads com estes filtros')).toBeVisible();

  // Arquivar dois.
  await page.getByRole('checkbox', { name: new RegExp(`${prefix} 1$`) }).check();
  await page.getByRole('checkbox', { name: new RegExp(`${prefix} 2$`) }).check();
  const bar = page.getByRole('region', { name: 'Ações nos leads selecionados' });
  await expect(bar.getByText('2 leads selecionados')).toBeVisible();
  await bar.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByText('2 leads arquivados.')).toBeVisible();
  await expect(page.getByText('1 lead com estes filtros')).toBeVisible();

  // Repor um a partir do filtro de arquivados.
  await page.getByLabel('Leads arquivados').selectOption('only');
  await expect(page.getByText('2 leads com estes filtros')).toBeVisible();
  await page.getByRole('checkbox', { name: new RegExp(`${prefix} 1$`) }).check();
  await page.getByRole('region', { name: 'Ações nos leads selecionados' }).getByRole('button', { name: 'Repor' }).click();
  await expect(page.getByText('1 lead reposto.')).toBeVisible();

  // Apagar todos os da pesquisa (com confirmação).
  await page.getByLabel('Leads arquivados').selectOption('include');
  await expect(page.getByText('3 leads com estes filtros')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Selecionar todos os leads desta página' }).check();
  await page.getByRole('region', { name: 'Ações nos leads selecionados' }).getByRole('button', { name: 'Apagar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Apagar 3 leads?' });
  await dialog.getByRole('button', { name: 'Apagar definitivamente' }).click();
  await expect(page.getByText('3 leads apagados.')).toBeVisible();
  await expect(page.getByText('Nenhum lead com estes filtros')).toBeVisible();
});

test('API: ações em conjunto exigem sessão e não contam leads já arquivados', async ({ page, playwright, baseURL }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Arquiva API ${run}` } })).json()).data;
  const first = await (await page.request.post('/api/v1/leads/bulk', { data: { action: 'archive', ids: [lead.id] } })).json();
  expect(first.data).toEqual({ action: 'archive', affected: 1 });
  const again = await (await page.request.post('/api/v1/leads/bulk', { data: { action: 'archive', ids: [lead.id] } })).json();
  expect(again.data.affected).toBe(0);

  // Sem sessão (o Playwright aplicaria a sessão guardada por omissão).
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const res = await anonymous.post('/api/v1/leads/bulk', { data: { action: 'delete', ids: [lead.id] } });
  expect(res.status()).toBe(401);
  await anonymous.dispose();
});

test('definições: ligar e desligar o arquivo automático', async ({ page }) => {
  await page.goto('/definicoes#lembretes');
  const card = page.locator('#lembretes');
  await card.getByLabel('Arquivar automaticamente os leads sem interesse').check();
  await card.getByLabel('Depois de quantos dias em “Sem interesse”').fill('45');
  await card.getByRole('button', { name: 'Guardar definições' }).click();
  await expect(page.getByText('Definições guardadas.')).toBeVisible();
  expect((await (await page.request.get('/api/v1/settings')).json()).data.auto_archive_days).toBe(45);

  await card.getByLabel('Arquivar automaticamente os leads sem interesse').uncheck();
  await card.getByRole('button', { name: 'Guardar definições' }).click();
  await expect(page.getByText('Definições guardadas.').last()).toBeVisible();
  await expect.poll(async () => (await (await page.request.get('/api/v1/settings')).json()).data.auto_archive_days).toBeNull();
});
