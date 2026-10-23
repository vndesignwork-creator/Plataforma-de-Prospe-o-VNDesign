import { expect, test, type APIRequestContext } from '@playwright/test';

/* Página Colaboradores (menu): todos por pessoa, convidar para outro projeto e remover. */
const run = Date.now().toString(36);

async function createClient(request: APIRequestContext, name: string) {
  const res = await request.post('/api/v1/leads?force=true', { data: { company_name: name, status: 'cliente' } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string };
}

test('colaboradores: lista por pessoa, convidar para outro projeto, remover e item no menu', async ({ page }) => {
  test.setTimeout(90_000);
  const a = await createClient(page.request, `Obra A ${run}`);
  await createClient(page.request, `Obra B ${run}`);
  const email = `freela-${run}@exemplo.pt`;
  const invited = await page.request.post(`/api/v1/leads/${a.id}/collaborators`, { data: { name: 'Marta Fotógrafa', email, send_email: false } });
  expect(invited.status(), await invited.text()).toBe(201);

  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Colaboradores' }).click();
  await expect(page).toHaveURL(/\/colaboradores$/);
  const card = page.getByRole('list', { name: 'Colaboradores' }).getByRole('listitem').filter({ hasText: email });
  await expect(card).toContainText('Marta Fotógrafa');
  await expect(card).toContainText('Convite por aceitar');
  const projects = card.getByRole('list', { name: 'Projetos de Marta Fotógrafa' });
  await expect(projects.getByRole('link', { name: `Obra A ${run}` })).toBeVisible();

  // Convidar para outro projeto (o nome e o email já vêm preenchidos).
  await card.getByRole('button', { name: 'Convidar para outro projeto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Convidar Marta Fotógrafa' });
  await expect(dialog.getByLabel('Email do colaborador')).toHaveValue(email);
  // O projeto onde já está não aparece na lista.
  await expect(dialog.getByLabel('Projeto').locator('option', { hasText: `Obra A ${run}` })).toHaveCount(0);
  const value = await dialog.getByLabel('Projeto').locator('option', { hasText: `Obra B ${run}` }).getAttribute('value');
  await dialog.getByLabel('Projeto').selectOption(value!);
  await dialog.getByLabel(/Enviar o convite por email/).uncheck();
  await dialog.getByRole('button', { name: 'Convidar' }).click();
  await expect(page.getByText(/Convite criado/)).toBeVisible();
  await expect(projects.getByRole('link', { name: `Obra B ${run}` })).toBeVisible();

  // Remover do projeto B.
  await projects.getByRole('button', { name: `Remover de Obra B ${run}` }).click();
  await projects.getByRole('button', { name: 'Sim' }).click();
  await expect(page.getByText('Removido do projeto: já não tem acesso.')).toBeVisible();
  await expect(projects.getByRole('link', { name: `Obra B ${run}` })).toHaveCount(0);

  // Com "Colaboradores" desligado, sai do menu.
  await page.request.patch('/api/v1/settings', { data: { features: { collaborators: false } } });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Colaboradores' })).toHaveCount(0);
  await page.request.patch('/api/v1/settings', { data: { features: { collaborators: true } } });
});
