import { expect, test } from '@playwright/test';

/*
 * Fazer uma proposta a partir de outra: duplicar no mesmo cliente e copiar a
 * proposta de outro cliente (itens, preços e textos iguais, rascunho novo).
 */
const run = Date.now().toString(36);

test('propostas: duplicar e partir da proposta de outro cliente', async ({ page }) => {
  test.setTimeout(120_000);
  const first = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Fonte Proposta ${run}` } })).json()).data as { id: string };
  const second = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Destino Proposta ${run}` } })).json()).data as { id: string; number: number };
  const created = await page.request.post(`/api/v1/leads/${first.id}/proposals`, {
    data: {
      title: `Site da esquina ${run}`,
      intro: 'Olá, segue a proposta.',
      items: [{ name: 'Site institucional', price: 1500, quantity: 1, features: ['5 páginas'] }],
      discount: 100,
      payment_terms: '50% no início',
      notes: 'Inclui uma ronda de revisões.',
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const source = (await created.json()).data as { id: string; code: string; total: number };
  expect(source.total).toBe(1400);

  try {
    // Duplicar no mesmo cliente: título com "(cópia)" e tudo igual.
    await page.goto(`/leads/${first.id}`);
    await page.getByRole('button', { name: `Duplicar a proposta ${source.code}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Proposta \d{4}-\d+/ })).toBeVisible();
    await expect(page.getByLabel('Título')).toHaveValue(`Site da esquina ${run} (cópia)`);
    // A cópia tem os mesmos itens e o mesmo total (ficou no mesmo cliente).
    const copies = (await (await page.request.get(`/api/v1/leads/${first.id}/proposals`)).json()).data as { total: number; items: { name: string }[] }[];
    expect(copies).toHaveLength(2);
    expect(copies.every((p) => p.total === 1400 && p.items[0]?.name === 'Site institucional')).toBe(true);

    // Partir da proposta de outro cliente: o rascunho fica no cliente de destino.
    await page.goto(`/leads/${second.id}/propostas/nova`);
    await page.getByRole('button', { name: 'Partir de outra proposta' }).click();
    const dialog = page.getByRole('dialog', { name: 'Partir de outra proposta' });
    // Pelo número da proposta: é a original (a cópia feita acima tem outro).
    await dialog.getByLabel('Procurar proposta').fill(source.code);
    await dialog.getByRole('button', { name: new RegExp(source.code) }).first().click();
    await expect(page.getByLabel('Título')).toHaveValue(`Site da esquina ${run}`);
    await expect(page.getByText('Olá, segue a proposta.')).toBeVisible();

    // Ficou mesmo no cliente de destino, com o desconto e as condições copiados.
    const list = (await (await page.request.get(`/api/v1/leads/${second.id}/proposals`)).json()).data as { total: number; discount: number; payment_terms: string; status: string }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.total).toBe(1400);
    expect(list[0]!.discount).toBe(100);
    expect(list[0]!.payment_terms).toBe('50% no início');
    expect(list[0]!.status).toBe('rascunho');
  } finally {
    await page.request.delete(`/api/v1/leads/${first.id}`);
    await page.request.delete(`/api/v1/leads/${second.id}`);
  }
});
