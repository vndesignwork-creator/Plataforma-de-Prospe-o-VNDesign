import { expect, test } from '@playwright/test';

/*
 * Datas dos pagamentos: o plano deixa escolher a data do sinal (em branco =
 * sem data) e a data prevista de cada pagamento muda-se na própria lista.
 */
const run = Date.now().toString(36);
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const pt = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

test('plano de pagamentos: data do sinal à escolha e datas que se mudam na lista', async ({ page }) => {
  test.setTimeout(150_000);
  await page.request.patch('/api/v1/settings', { data: { features: { payments: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Datas ${run}`, status: 'cliente', estimated_value: 200 } })).json()).data as { id: string };

  try {
    // Plano com o sinal para daqui a uma semana (em vez de hoje).
    const plano = await page.request.post(`/api/v1/leads/${lead.id}/payments/plan`, {
      data: { total: 200, split: [50, 50], first_due_on: iso(7) },
    });
    expect(plano.status(), await plano.text()).toBe(201);
    const criados = (await plano.json()).data as { description: string; due_on: string | null }[];
    expect(criados.find((p) => p.description.startsWith('Sinal'))?.due_on).toBe(iso(7));
    expect(criados.find((p) => p.description.startsWith('Entrega'))?.due_on).toBeNull();

    // Na ficha: a data prevista muda-se ali mesmo.
    await page.goto(`/leads/${lead.id}`);
    const card = page.locator('#pagamentos');
    await expect(card.getByRole('button', { name: /^Mudar a data prevista de Sinal/ })).toContainText(`Previsto a ${pt(iso(7))}`);
    await card.getByRole('button', { name: /^Mudar a data prevista de Entrega/ }).click();
    await card.getByLabel(/^Data prevista de Entrega/).fill(pt(iso(30)));
    await card.getByLabel(/^Data prevista de Entrega/).press('Enter');
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: `Previsto a ${pt(iso(30))}` })).toBeVisible();
    const guardados = (await (await page.request.get(`/api/v1/leads/${lead.id}/payments`)).json()).data as { description: string; due_on: string | null }[];
    expect(guardados.find((p) => p.description.startsWith('Entrega'))?.due_on).toBe(iso(30));

    // Sem data no sinal: o plano criado em branco não marca nada.
    const outro = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Sem data ${run}`, status: 'cliente' } })).json()).data as { id: string };
    try {
      const semData = await page.request.post(`/api/v1/leads/${outro.id}/payments/plan`, { data: { total: 100, split: [100], first_due_on: null } });
      expect(semData.status(), await semData.text()).toBe(201);
      expect(((await semData.json()).data as { due_on: string | null }[])[0]?.due_on).toBeNull();
    } finally {
      await page.request.delete(`/api/v1/leads/${outro.id}`);
    }
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
