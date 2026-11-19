import { crc32, deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/*
 * Assinatura de email para o cliente, feita do kit da marca: abre-se no kit,
 * vem preenchida com os dados do cliente e mostra como vai ficar.
 */
const run = Date.now().toString(36);

function png(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 32 }, () => [239, 92, 50]).flat())]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 16 }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('kit da marca: assinatura de email do cliente', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, brand_kit: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: {
      company_name: `Padaria Assinatura ${run}`,
      contact_name: 'Ana Ribeiro',
      status: 'cliente',
      email: `ana@assinatura-${run}.pt`,
      phone: '912 345 678',
      website: `https://assinatura-${run}.pt`,
      city: 'Braga',
    },
  })).json()).data as { id: string };

  try {
    await page.request.post(`/api/v1/leads/${lead.id}/brand-kit/files`, {
      multipart: { files: { name: 'logotipo.png', mimeType: 'image/png', buffer: png() } },
    });
    await page.request.patch(`/api/v1/leads/${lead.id}/brand-kit`, { data: { colors: [{ name: 'Laranja', hex: '#ef5c32' }] } });

    await page.goto(`/leads/${lead.id}`);
    const card = page.locator('#kit-marca');
    await card.getByRole('button', { name: 'Assinatura de email' }).click();
    const dialog = page.getByRole('dialog', { name: 'Assinatura de email do cliente' });

    // Vem preenchida com os dados do cliente e a cor do kit.
    await expect(dialog.getByLabel('Nome')).toHaveValue('Ana Ribeiro');
    await expect(dialog.getByLabel('Empresa')).toHaveValue(`Padaria Assinatura ${run}`);
    await expect(dialog.getByLabel('Email')).toHaveValue(`ana@assinatura-${run}.pt`);
    const preview = dialog.getByTestId('pre-visualizacao-assinatura');
    await expect(preview).toContainText('Ana Ribeiro');
    await expect(preview).toContainText(`Padaria Assinatura ${run}`);
    // O logótipo do kit entra na assinatura (embutido, para colar no email).
    const img = preview.getByRole('img', { name: `Padaria Assinatura ${run}` });
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);

    // O cargo escrito aparece logo na pré-visualização.
    await dialog.getByLabel('Cargo').fill('Gerente');
    await expect(preview).toContainText('Gerente');

    // Sem logótipo também funciona.
    await dialog.getByLabel('Logótipo', { exact: true }).selectOption({ label: 'Sem logótipo' });
    await expect(preview.getByRole('img')).toHaveCount(0);
    await expect(preview).toContainText('Ana Ribeiro');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
