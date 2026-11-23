import { expect, test } from '@playwright/test';

/*
 * Pedir indicação: o email pronto na ficha do cliente, o "Já pedi" na linha do
 * tempo e o registo de quem indicou cada lead novo.
 */
const run = Date.now().toString(36);

test('indicações: pedir ao cliente, registar quem indicou e ver a lista', async ({ page }) => {
  test.setTimeout(150_000);
  await page.request.patch('/api/v1/settings', { data: { features: { referrals: true, projects: true } } });
  const cliente = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Cliente Indica ${run}`, status: 'cliente', contact_name: 'Ana Dias', project_title: 'site novo' } })).json()).data as { id: string; number: number };
  const indicado = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Veio Por Indicação ${run}` } })).json()).data as { id: string };

  try {
    // Na ficha do cliente, a secção com o email pronto.
    await page.goto(`/leads/${cliente.id}#projeto`);
    await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: /^Cliente/ }).click();
    const seccao = page.getByRole('region', { name: 'Pedir indicação' });
    await expect(seccao).toContainText('Ainda não pediste');
    await seccao.getByRole('button', { name: 'Email de indicação' }).click();
    const dialogo = page.getByRole('dialog', { name: new RegExp(`Pedir indicação · Cliente Indica ${run}`) });
    await expect(dialogo.getByLabel('Assunto')).toHaveValue(`Um favor pequeno · Cliente Indica ${run}`);
    await expect(dialogo.getByLabel('Mensagem')).toContainText('Olá Ana,');
    await page.keyboard.press('Escape');

    // "Já pedi" fica registado.
    await seccao.getByRole('button', { name: 'Já pedi' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Ficou registado' })).toBeVisible();
    await expect(seccao).toContainText('Pediste a');
    const depois = (await (await page.request.get(`/api/v1/leads/${cliente.id}/referrals`)).json()).data as { asked_at: string | null };
    expect(depois.asked_at).not.toBeNull();

    // Quem indicou o lead novo: fica na ficha e aparece na lista do cliente.
    const guardado = await page.request.patch(`/api/v1/leads/${indicado.id}`, { data: { referred_by: cliente.id } });
    expect(guardado.status(), await guardado.text()).toBe(200);
    const lista = (await (await page.request.get(`/api/v1/leads/${cliente.id}/referrals`)).json()).data as { referred: { company_name: string }[] };
    expect(lista.referred.some((r) => r.company_name === `Veio Por Indicação ${run}`)).toBe(true);

    await page.reload();
    await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: /^Cliente/ }).click();
    await expect(page.getByRole('region', { name: 'Pedir indicação' })).toContainText('Já indicou 1 cliente');

    // No formulário do lead indicado, o cliente aparece escolhido.
    await page.goto(`/leads/${indicado.id}/editar`);
    await expect(page.getByLabel('Indicado por')).toHaveValue(cliente.id);
  } finally {
    await page.request.delete(`/api/v1/leads/${indicado.id}`);
    await page.request.delete(`/api/v1/leads/${cliente.id}`);
  }
});
