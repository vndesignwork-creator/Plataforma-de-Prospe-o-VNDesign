import { expect, test } from '@playwright/test';

/* Perfil: nome a mostrar (alcunha) e foto, no menu e na equipa; o menu leva a Definições → Conta. */
const run = Date.now().toString(36);
// PNG de 40×30 (laranja), suficiente para o browser recortar e reduzir.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAL0lEQVR4nO3NIQEAMAgAsPNI5KG/pQIVcJitwKIr34V/sorFYrFYLBaLxWKxeGUA0RUBua8q61gAAAAASUVORK5CYII=',
  'base64',
);

test('perfil: nome a mostrar e foto no menu; o menu leva à conta', async ({ page }) => {
  const nick = `Va ${run}`;
  try {
    await page.goto('/definicoes/conta');
    const card = page.getByRole('region', { name: 'Perfil' }).or(page.locator('#perfil'));
    await card.getByLabel('Nome a mostrar').fill(nick);
    await card.getByRole('button', { name: 'Guardar nome' }).click();
    await expect(page.getByText('Nome guardado.')).toBeVisible();

    // O menu mostra o nome (e as iniciais, sem foto) e leva à conta.
    const account = page.getByRole('navigation', { name: 'Principal' }).first().locator('xpath=..').getByRole('link', { name: `A minha conta: ${nick}` });
    await expect(account).toBeVisible();
    // A equipa (Responsável) também usa a alcunha.
    const names = (await (await page.request.get('/api/v1/team/names')).json()).data as { name: string }[];
    expect(names.some((n) => n.name === nick)).toBe(true);

    // Foto: recortada no browser, guardada e servida por um link temporário.
    await card.getByLabel('Escolher foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Foto guardada.')).toBeVisible();
    const img = account.locator('img');
    await expect(img).toHaveAttribute('src', /\/api\/v1\/avatars\/[0-9a-f-]{36}\?v=\d+/);
    const photo = await page.request.get((await img.getAttribute('src'))!);
    expect(photo.status()).toBe(200);
    expect(photo.headers()['content-type']).toMatch(/^image\//);

    // A foto também aparece na equipa (Definições → Equipa e nos nomes do Responsável).
    const withPhoto = (await (await page.request.get('/api/v1/team/names')).json()).data as { name: string; avatar_url: string | null }[];
    expect(withPhoto.find((n) => n.name === nick)?.avatar_url).toMatch(/^\/api\/v1\/avatars\//);
    await page.goto('/definicoes/equipa');
    await expect(page.getByRole('list', { name: 'Membros da equipa' }).getByRole('listitem').filter({ hasText: nick }).locator('img')).toBeVisible();
    await page.goto('/definicoes/conta');

    await card.getByRole('button', { name: 'Tirar foto' }).click();
    await expect(page.getByText('Foto tirada.')).toBeVisible();
    await expect(account.locator('img')).toHaveCount(0);

    await page.goto('/dashboard');
    await page.getByRole('link', { name: `A minha conta: ${nick}` }).first().click();
    await expect(page).toHaveURL(/\/definicoes\/conta$/);
  } finally {
    await page.request.patch('/api/v1/me/profile', { data: { display_name: null } });
  }
});

test('perfil pela API: validações', async ({ request }) => {
  expect((await request.patch('/api/v1/me/profile', { data: { display_name: 'x'.repeat(61) } })).status()).toBe(400);
  const wrong = await request.post('/api/v1/me/avatar', { multipart: { file: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('olá') } } });
  expect(wrong.status()).toBe(422);
  const me = (await (await request.get('/api/v1/me')).json()).data as { profile: { name: string; avatar_url: string | null } };
  expect(me.profile.name.length).toBeGreaterThan(0);
});
