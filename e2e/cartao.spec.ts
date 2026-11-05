import { expect, test } from '@playwright/test';

/* Cartão de contacto: criar nas Definições, abrir sem sessão, guardar contacto e deixar o contacto (fica lead). */
test('cartão de contacto: link público, vCard e contacto que fica lead', async ({ page, browser, baseURL }) => {
  const run = Date.now().toString(36);
  const res = await page.request.patch('/api/v1/business-card', { data: { enabled: true, bio: `Sites rápidos ${run}` } });
  expect(res.ok()).toBe(true);
  const card = (await res.json()).data as { url: string; token: string; qr_svg: string };
  expect(card.qr_svg).toContain('<svg');

  await page.goto('/definicoes/assinatura');
  await expect(page.getByRole('img', { name: 'Código QR do cartão de contacto' })).toBeVisible();

  // Sem sessão.
  const anon = await browser.newContext({ baseURL });
  const pub = await anon.newPage();
  await pub.goto(`/cartao/${card.token}`);
  await expect(pub.getByText(`Sites rápidos ${run}`)).toBeVisible();
  const vcard = await anon.request.get(`/api/v1/public/cards/${card.token}/vcard`);
  expect(vcard.headers()['content-type']).toContain('text/vcard');
  expect(await vcard.text()).toContain('BEGIN:VCARD');

  await pub.getByLabel('Nome').fill(`Cartão Lead ${run}`);
  await pub.getByLabel('Telefone').fill('912345678');
  await pub.getByRole('button', { name: 'Enviar' }).click();
  await expect(pub.getByText(/Obrigado!/)).toBeVisible();
  await anon.close();

  const leads = (await (await page.request.get(`/api/v1/leads?q=${run}`)).json()).data as { id: string; channel: string; status: string }[];
  expect(leads).toHaveLength(1);
  expect(leads[0]).toMatchObject({ channel: 'pessoal', status: 'respondeu' });
  await page.request.delete(`/api/v1/leads/${leads[0]!.id}`);

  // Desligado: o link deixa de abrir.
  await page.request.patch('/api/v1/business-card', { data: { enabled: false } });
  expect((await page.request.get(`/api/v1/public/cards/${card.token}/vcard`)).status()).toBe(404);
  await page.request.patch('/api/v1/business-card', { data: { enabled: true } });
});
