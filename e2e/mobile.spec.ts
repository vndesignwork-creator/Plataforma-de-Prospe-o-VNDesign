import { expect, test } from '@playwright/test';

test('no telemóvel a lista mostra cartões e o menu abre', async ({ page }) => {
  await page.goto('/leads');
  await expect(page.getByRole('heading', { name: 'Pipeline de leads' })).toBeVisible();
  await expect(page.locator('table')).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Definições' })).toBeVisible();
  // Sem scroll horizontal na página.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('no telemóvel o dashboard, o Kanban e a importação não têm scroll horizontal', async ({ page }) => {
  for (const path of ['/dashboard', '/kanban', '/importar']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
