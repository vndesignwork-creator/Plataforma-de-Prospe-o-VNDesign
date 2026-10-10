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

test('no telemóvel deslizar no Kanban faz scroll e não arrasta cartões; manter premido arrasta', async ({ page, context }) => {
  const run = Date.now().toString(36);
  for (let i = 0; i < 6; i++) await page.request.post('/api/v1/leads', { data: { company_name: `Deslizar ${run} ${i}` } });
  await page.goto('/kanban');
  const column = page.getByLabel('Leads em Identificado');
  await expect(column.getByText(`Deslizar ${run} 0`)).toBeVisible();

  const cdp = await context.newCDPSession(page);
  const touch = (type: string, x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  async function swipe(x1: number, y1: number, x2: number, y2: number, hold = 0) {
    await touch('touchStart', x1, y1);
    if (hold) await page.waitForTimeout(hold);
    for (let i = 1; i <= 15; i++) {
      await touch('touchMove', x1 + ((x2 - x1) * i) / 15, y1 + ((y2 - y1) * i) / 15);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(500);
  }
  const scroller = page.locator('[data-column]').first().locator('..');
  const box = (await column.locator('li').first().boundingBox())!;

  // Para cima: a página faz scroll e nenhum lead muda de estado.
  await swipe(box.x + 120, box.y + 20, box.x + 120, box.y - 200);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(50);
  // Para o lado: o quadro passa para a coluna seguinte.
  // A meio do ecrã (o índice de colunas fica preso no topo).
  const middle = page.viewportSize()!.height / 2;
  await swipe(box.x + 220, middle, box.x + 20, middle + 5);
  expect(await scroller.evaluate((e) => e.scrollLeft)).toBeGreaterThan(100);
  await expect(page.getByText(/→ /)).toHaveCount(0);

  // Manter premido e arrastar para a coluna seguinte muda o estado.
  await page.getByRole('navigation', { name: 'Colunas do Kanban' }).getByRole('button', { name: /^Identificado/ }).click();
  await page.waitForTimeout(600);
  const first = (await column.locator('li').first().boundingBox())!;
  const viewport = page.viewportSize()!;
  await swipe(first.x + 120, first.y + 20, viewport.width - 10, first.y + 40, 450);
  await expect(page.getByText(/→ /)).toBeVisible();
});
