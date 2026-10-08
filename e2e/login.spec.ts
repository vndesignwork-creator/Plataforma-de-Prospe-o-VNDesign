import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('páginas protegidas redirecionam para o login', async ({ page }) => {
  await page.goto('/leads');
  await expect(page).toHaveURL(/\/login\?next=%2Fleads/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('palavra-passe errada mostra erro em português', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('ninguem@vndesign.pt');
  await page.getByLabel('Palavra-passe').fill('errada-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Email ou palavra-passe incorretos.')).toBeVisible();
});

test('a API sem sessão devolve 401 em problem+json', async ({ request }) => {
  const res = await request.get('/api/v1/leads');
  expect(res.status()).toBe(401);
  expect(res.headers()['content-type']).toContain('application/problem+json');
});
