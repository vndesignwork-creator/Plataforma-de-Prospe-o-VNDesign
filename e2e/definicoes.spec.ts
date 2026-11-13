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
  await page.getByRole('navigation', { name: 'Secções das definições' }).getByRole('link', { name: 'Conta', exact: true }).click();
  await expect(page).toHaveURL(/\/definicoes\/assinatura$/);

  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(cargo).toHaveValue(before);
  await expect(page.getByText('Alterações por guardar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar assinatura' })).toBeDisabled();
});
