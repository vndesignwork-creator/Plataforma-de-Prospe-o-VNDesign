import { expect, test as setup } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

setup('iniciar sessão', async ({ page }) => {
  if (!email || !password) throw new Error('Define E2E_EMAIL e E2E_PASSWORD (ver .env.example).');
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Pipeline de leads' })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
