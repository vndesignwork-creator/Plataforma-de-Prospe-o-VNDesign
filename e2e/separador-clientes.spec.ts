import { expect, test } from '@playwright/test';

/*
 * Clientes: saem da lista de Leads e vivem no separador "Clientes" da página Projetos.
 * É a mesma ficha (nada se duplica): quem filtrar por "Com clientes" volta a vê-los nos Leads.
 */
const run = Date.now().toString(36);

test('clientes fora da lista de Leads e no separador Clientes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, payments: true } } });
  const prospectName = `Lead Fria ${run}`;
  const clientName = `Cliente Vivo ${run}`;
  const prospect = await page.request.post('/api/v1/leads?force=true', { data: { company_name: prospectName, status: 'identificado' } });
  expect(prospect.status(), await prospect.text()).toBe(201);
  const prospectId = (await prospect.json()).data.id as string;
  const client = await page.request.post('/api/v1/leads?force=true', { data: { company_name: clientName, status: 'cliente', estimated_value: 2500 } });
  expect(client.status(), await client.text()).toBe(201);
  const clientId = (await client.json()).data.id as string;

  try {
    // Lista de Leads (a pesquisa só traz estes dois): o cliente não aparece.
    await page.goto(`/leads?q=${run}`);
    await expect(page.getByRole('link', { name: new RegExp(prospectName) })).toBeVisible();
    await expect(page.getByText(clientName)).toHaveCount(0);

    // "Com clientes": volta a aparecer (é a mesma ficha, não uma cópia).
    await page.getByLabel('Clientes: Sem clientes').click();
    await page.getByRole('menuitemradio', { name: 'Com clientes' }).click();
    await expect(page.getByRole('link', { name: new RegExp(clientName) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(prospectName) })).toBeVisible();

    // A etiqueta do filtro tira-se e os clientes saem outra vez.
    await page.getByRole('button', { name: /^Tirar o filtro Clientes/ }).click();
    await expect(page.getByText(clientName)).toHaveCount(0);

    // Separador Clientes (página Projetos): o cliente está lá, uma vez só.
    await page.goto('/projetos?ver=clientes');
    const list = page.getByRole('list', { name: 'Clientes' });
    await expect(list.getByRole('link', { name: new RegExp(clientName) })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /Clientes/ })).toHaveAttribute('aria-selected', 'true');

    // E o separador Projetos continua a mostrar os projetos.
    await page.getByRole('tab', { name: /Projetos/ }).click();
    await expect(page.getByRole('heading', { name: 'Projetos', level: 1 })).toBeVisible();
  } finally {
    await page.request.delete(`/api/v1/leads/${prospectId}`);
    await page.request.delete(`/api/v1/leads/${clientId}`);
  }
});
