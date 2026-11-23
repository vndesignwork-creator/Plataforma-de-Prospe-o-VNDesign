import { expect, test } from '@playwright/test';

/*
 * Custos fixos: o que se paga todos os meses entra no relatório para a
 * contabilidade e baixa o resultado do mês.
 */
const run = Date.now().toString(36);
const mes = new Date().toISOString().slice(0, 7);

test('custos fixos: criar, editar, entrar no relatório e apagar', async ({ page }) => {
  test.setTimeout(150_000);
  await page.request.patch('/api/v1/settings', { data: { features: { accounting_report: true, expenses: true } } });

  await page.goto('/definicoes/custos-fixos');
  await expect(page.getByRole('heading', { name: 'Custos fixos' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo custo fixo' }).click();
  await page.getByLabel('Descrição').fill(`Alojamento ${run}`);
  await page.getByLabel('Por mês (€)').fill('12,50');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Custo fixo acrescentado' })).toBeVisible();
  const lista = page.getByRole('list', { name: 'Custos fixos' });
  await expect(lista.getByText(`Alojamento ${run}`)).toBeVisible();
  await expect(lista.getByText('12,50 €/mês')).toBeVisible();

  const criados = (await (await page.request.get('/api/v1/fixed-costs')).json()).data as { id: string; description: string; amount: number }[];
  const meu = criados.find((c) => c.description === `Alojamento ${run}`)!;
  expect(meu.amount).toBe(12.5);

  try {
    // No relatório do mês: os custos fixos aparecem e saem do resultado.
    const relatorio = (await (await page.request.get(`/api/v1/reports/accounting?month=${mes}`)).json()).data as {
      received: { total: number };
      expenses: { total: number };
      fixed: { total: number; rows: { description: string }[] };
      result: number;
    };
    expect(relatorio.fixed.rows.some((r) => r.description === `Alojamento ${run}`)).toBe(true);
    expect(relatorio.fixed.total).toBeGreaterThanOrEqual(12.5);
    expect(relatorio.result).toBe(Math.round((relatorio.received.total - relatorio.expenses.total - relatorio.fixed.total) * 100) / 100);

    // Editar o valor.
    await page.getByRole('button', { name: `Editar Alojamento ${run}` }).click();
    await page.getByLabel('Por mês (€)').fill('20');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Custo fixo guardado' })).toBeVisible();
    await expect(lista.getByText('20,00 €/mês')).toBeVisible();

    // Um custo que já acabou não conta no mês de hoje.
    const antigo = await page.request.post('/api/v1/fixed-costs', {
      data: { description: `Antigo ${run}`, amount: 99, starts_on: '2025-01', ends_on: '2025-06' },
    });
    expect(antigo.status(), await antigo.text()).toBe(201);
    const depois = (await (await page.request.get(`/api/v1/reports/accounting?month=${mes}`)).json()).data as { fixed: { rows: { description: string }[] } };
    expect(depois.fixed.rows.some((r) => r.description === `Antigo ${run}`)).toBe(false);
    await page.request.delete(`/api/v1/fixed-costs/${((await (await page.request.get('/api/v1/fixed-costs')).json()).data as { id: string; description: string }[]).find((c) => c.description === `Antigo ${run}`)!.id}`);

    // Não aceita um fim antes do início.
    const invalido = await page.request.post('/api/v1/fixed-costs', { data: { description: 'X', amount: 5, starts_on: '2026-11', ends_on: '2026-10' } });
    expect(invalido.status()).toBe(400);
  } finally {
    await page.reload();
    await page.getByRole('button', { name: `Apagar Alojamento ${run}` }).click();
    await page.getByRole('button', { name: 'Apagar', exact: true }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Custo fixo apagado' })).toBeVisible();
  }
});
