import { expect, test } from '@playwright/test';

/* Endereços amigáveis das fichas: /leads/13-o-quintal (o id interno antigo continua a funcionar). */
const run = Date.now().toString(36);

test('fichas com endereço amigável; id antigo, só o número e nome antigo redirecionam', async ({ page }) => {
  const name = `Café Ária ${run}`;
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: name } })).json()).data;
  const slug = `${lead.number}-cafe-aria-${run}`;

  // A lista liga ao endereço amigável.
  await page.goto(`/leads?q=${encodeURIComponent(name)}`);
  await page.getByRole('link', { name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/leads/${slug}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Id interno, só o número e um nome desatualizado vão dar ao mesmo sítio.
  for (const ref of [lead.id, String(lead.number), `${lead.number}-nome-antigo`]) {
    await page.goto(`/leads/${ref}`);
    await expect(page).toHaveURL(new RegExp(`/leads/${slug}$`));
  }

  // Subpáginas e parâmetros também.
  await page.goto(`/leads/${lead.id}/editar`);
  await expect(page).toHaveURL(new RegExp(`/leads/${slug}/editar$`));
  await page.goto(`/leads/${lead.number}/juntar?rascunho=1`);
  await expect(page).toHaveURL(new RegExp(`/leads/${slug}/juntar\\?rascunho=1$`));

  // Mudar o nome: o endereço antigo continua a abrir a ficha (já com o nome novo).
  await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { company_name: `Pastelaria Nova ${run}` } });
  await page.goto(`/leads/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/leads/${lead.number}-pastelaria-nova-${run}$`));
});

test('número que não existe dá "página não encontrada"', async ({ page }) => {
  const res = await page.goto('/leads/999999-nao-existe');
  expect(res?.status()).toBe(404);
});
