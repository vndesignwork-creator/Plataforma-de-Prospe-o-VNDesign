import { crc32, deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/*
 * Kit da marca: cores tiradas do logótipo, manual de marca em PDF, "Descarregar tudo" (ZIP, também
 * na página do cliente) e códigos QR com a cor da marca (guardados no kit).
 */
const run = Date.now().toString(36);

/** Um PNG verdadeiro de 8×8, todo laranja #ef5c32. */
function orangePng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => [239, 92, 50]).flat())]);
  const raw = Buffer.concat(Array.from({ length: 8 }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('kit da marca: cores do logótipo, manual em PDF, ZIP (também na página do cliente) e código QR', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, brand_kit: true, client_page: true } } });
  const res = await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Marca Sol ${run}`, status: 'cliente', website: 'https://marcasol.pt' } });
  expect(res.status(), await res.text()).toBe(201);
  const lead = (await res.json()).data as { id: string };
  const upload = await page.request.post(`/api/v1/leads/${lead.id}/brand-kit/files`, {
    multipart: { files: { name: 'logotipo.png', mimeType: 'image/png', buffer: orangePng() } },
  });
  expect(upload.status(), await upload.text()).toBeLessThan(300);
  await page.request.patch(`/api/v1/leads/${lead.id}/brand-kit`, { data: { fonts: [{ name: 'Plus Jakarta Sans', usage: 'texto' }] } });

  // Cores do logótipo (lidas no browser).
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#kit-marca');
  await card.getByRole('button', { name: 'Cores do logótipo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cores do logótipo' });
  await dialog.getByRole('button', { name: 'Ler as cores de logotipo.png' }).click();
  await expect(dialog.getByRole('list', { name: 'Cores encontradas' })).toContainText('#ef5c32');
  await dialog.getByRole('button', { name: /^Juntar 1 ao kit/ }).click();
  await expect(page.getByText('1 cor juntada ao kit.')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Cores' })).toContainText('#ef5c32');

  // Manual de marca em PDF.
  const manual = await page.request.get(`/api/v1/leads/${lead.id}/brand-kit/manual`);
  expect(manual.status()).toBe(200);
  expect(manual.headers()['content-type']).toContain('application/pdf');
  expect((await manual.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // "Descarregar tudo": ficheiros do kit, manual e resumo.
  const zip = await page.request.get(`/api/v1/leads/${lead.id}/brand-kit/zip`);
  expect(zip.status()).toBe(200);
  const bytes = await zip.body();
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  for (const name of ['Kit da marca/logotipo.png', 'Leia-me.txt', 'Manual-de-marca-Marca-Sol-']) expect(bytes.includes(Buffer.from(name, 'utf8'))).toBe(true);

  // Código QR com a cor da marca, guardado no kit.
  await card.getByRole('button', { name: 'Código QR' }).click();
  const qr = page.getByRole('dialog', { name: 'Código QR' });
  await expect(qr.getByLabel('Endereço')).toHaveValue('https://marcasol.pt');
  await expect(qr.getByRole('img', { name: 'Pré-visualização do código QR' })).toBeVisible();
  await qr.getByLabel('Logótipo ao centro').selectOption({ label: 'logotipo.png' });
  await qr.getByRole('button', { name: 'Guardar no kit' }).click();
  await expect(page.getByText('Código QR guardado no kit.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(qr).toHaveCount(0);
  await expect(card.getByRole('list', { name: 'Ficheiros do kit' })).toContainText(`qr-site-marca-sol-${run}.png`);

  // Página do cliente: "Descarregar tudo (ZIP)".
  const token = (await (await page.request.post(`/api/v1/leads/${lead.id}/project/share`, { data: { enabled: true } })).json()).data.share_token as string;
  const client = await page.context().browser()!.newPage();
  try {
    await client.goto(`/p/${token}`);
    const link = client.getByRole('link', { name: 'Descarregar tudo (ZIP)' });
    await expect(link).toHaveAttribute('href', `/api/v1/public/projects/${token}/kit`);
    const shared = await client.request.get(`/api/v1/public/projects/${token}/kit`);
    expect(shared.status()).toBe(200);
    expect((await shared.body()).subarray(0, 2).toString()).toBe('PK');
  } finally {
    await client.close();
  }
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});
