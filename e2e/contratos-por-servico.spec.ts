import { expect, test } from '@playwright/test';

/*
 * Contratos por tipo de serviço: em Definições escreve-se um modelo para certos
 * serviços (ex.: loja online) e o contrato desse projeto sai com essas
 * condições, em vez das gerais.
 */
const run = Date.now().toString(36);

test('contratos: condições próprias para um tipo de serviço', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, contracts: true } } });
  const before = (await (await page.request.get('/api/v1/settings')).json()).data.contract as { provider_nif: string; clauses: string; templates?: unknown[] };

  const loja = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Loja ${run}`, status: 'cliente', services: ['loja_online'], estimated_value: 2500 },
  })).json()).data as { id: string };
  const site = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Site ${run}`, status: 'cliente', services: ['site_institucional'], estimated_value: 1200 },
  })).json()).data as { id: string };

  try {
    // Definições → Funcionalidades: um modelo para a loja online.
    await page.goto('/definicoes/funcionalidades');
    const card = page.getByRole('region', { name: 'Contratos' });
    await card.getByRole('button', { name: 'Modelo para um serviço' }).click();
    await card.getByLabel('Nome do modelo').fill('Loja online');
    await card.getByRole('button', { name: 'Pequenas Lojas', exact: true }).click();
    await card.getByLabel('Condições do modelo Loja online').fill(`Stock: o cliente trata do stock ${run}.`);
    await card.getByRole('button', { name: 'Guardar condições' }).click();
    await expect(page.getByText(/Contratos: guardado/)).toBeVisible();

    // O contrato da loja sai com as condições do modelo.
    const made = await page.request.post(`/api/v1/leads/${loja.id}/contracts`, { data: {} });
    expect(made.status(), await made.text()).toBe(201);
    const contract = (await made.json()).data as { content: { sections: { title: string; body: string }[] } };
    const general = contract.content.sections.find((s) => s.title === 'Condições gerais');
    expect(general?.body).toContain(`Stock: o cliente trata do stock ${run}.`);

    // O de um site (que nenhum modelo serve) fica com as condições gerais.
    const other = await page.request.post(`/api/v1/leads/${site.id}/contracts`, { data: {} });
    expect(other.status()).toBe(201);
    const otherContract = (await other.json()).data as { content: { sections: { title: string; body: string }[] } };
    const otherGeneral = otherContract.content.sections.find((s) => s.title === 'Condições gerais');
    expect(otherGeneral?.body).not.toContain(`Stock: o cliente trata do stock ${run}.`);
    expect(otherGeneral?.body).toContain('Conteúdos');

    // O modelo ficou guardado nas definições e pode ser apagado.
    const saved = (await (await page.request.get('/api/v1/settings')).json()).data.contract as { templates: { label: string; services: string[] }[] };
    expect(saved.templates).toHaveLength(1);
    expect(saved.templates[0]).toMatchObject({ label: 'Loja online', services: ['loja_online'] });
    await page.reload();
    await card.getByRole('button', { name: 'Apagar o modelo Loja online' }).click();
    await card.getByRole('button', { name: 'Guardar condições' }).click();
    await expect(page.getByText(/Contratos: guardado/)).toBeVisible();
    const after = (await (await page.request.get('/api/v1/settings')).json()).data.contract as { templates: unknown[] };
    expect(after.templates).toHaveLength(0);
  } finally {
    await page.request.patch('/api/v1/settings', { data: { contract: { provider_nif: before.provider_nif, clauses: before.clauses, templates: [] } } });
    await page.request.delete(`/api/v1/leads/${loja.id}`);
    await page.request.delete(`/api/v1/leads/${site.id}`);
  }
});
