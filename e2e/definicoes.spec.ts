import { expect, test } from '@playwright/test';

/* Definições: uma página por secção; endereços antigos com âncora continuam a funcionar. */
test('cada secção tem a sua página e os links antigos com # redirecionam', async ({ page }) => {
  // A página inicial mostra as secções por grupo, com o estado de cada uma.
  await page.goto('/definicoes');
  const perfil = page.getByRole('region', { name: 'O meu perfil' });
  await expect(perfil.getByRole('link', { name: /Assinatura/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Email e contactos' }).getByRole('link', { name: /Email de envio/ })).toBeVisible();

  await perfil.getByRole('link', { name: /Assinatura/ }).click();
  await expect(page).toHaveURL(/\/definicoes\/assinatura$/);
  const nav = page.getByRole('navigation', { name: 'Secções das definições' });
  await expect(nav.getByRole('link', { name: 'Assinatura' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Listas de tarefas' }).click();
  await expect(page).toHaveURL(/\/definicoes\/listas-tarefas$/);
  await expect(page.getByRole('heading', { name: 'Listas de tarefas' })).toBeVisible();
  // Só a secção escolhida está na página.
  await expect(page.getByRole('heading', { name: 'Assinatura' })).toHaveCount(0);

  await page.goto('/definicoes#api');
  await expect(page).toHaveURL(/\/definicoes\/api$/);
  await expect(page.getByRole('heading', { name: 'Acesso externo (API)' })).toBeVisible();
});

test('assinatura: alterações por guardar, descartar e aviso ao sair', async ({ page }) => {
  await page.goto('/definicoes/assinatura');
  const cargo = page.getByLabel('Cargo');
  const before = await cargo.inputValue();
  await cargo.fill(`${before} (teste)`);
  await expect(page.getByRole('status').filter({ hasText: 'Alterações por guardar' })).toBeVisible();

  // Seguir um link pergunta antes; ao cancelar, fica na página.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('alterações por guardar');
    void d.dismiss();
  });
  await page.getByRole('navigation', { name: 'Secções das definições' }).getByRole('link', { name: 'Conta' }).click();
  await expect(page).toHaveURL(/\/definicoes\/assinatura$/);

  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(cargo).toHaveValue(before);
  await expect(page.getByText('Alterações por guardar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar assinatura' })).toBeDisabled();
});

test('notas editáveis no cartão da ficha', async ({ page }) => {
  const run = Date.now().toString(36);
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Notas Rápidas ${run}` } })).json()).data;
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Editar notas' }).click();
  await page.getByLabel('Notas do lead').fill('Atendeu o Sr. Rui. Menu em oquintal.pt/menu');
  await page.getByRole('button', { name: 'Guardar notas' }).click();
  await expect(page.getByText('Notas guardadas.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'oquintal.pt/menu' })).toBeVisible();
  // Continua na ficha (sem ir ao formulário).
  await expect(page).toHaveURL(new RegExp(`/leads/${lead.number}-notas-rapidas-`));
  expect((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data.notes).toBe('Atendeu o Sr. Rui. Menu em oquintal.pt/menu');
});
