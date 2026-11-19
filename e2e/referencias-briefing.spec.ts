import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Browser } from '@playwright/test';

/*
 * Referências no briefing: o cliente junta sites de que gosta e imagens, com
 * uma nota em cada ("gosto destas cores"); a ficha mostra-as ao lado das
 * respostas (as imagens como pré-visualização).
 */
const run = Date.now().toString(36);

/** Um PNG verdadeiro de 8×8, azul. */
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
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => [40, 90, 200]).flat())]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 8 }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function anonymous(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test('briefing: o cliente junta sites e imagens de referência com uma nota', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, briefing: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Referências ${run}`, contact_name: 'Ana', status: 'cliente' },
  })).json()).data as { id: string };

  try {
    const briefing = (await (await page.request.post(`/api/v1/leads/${lead.id}/briefing`)).json()).data as { token: string };
    const client = await anonymous(browser);
    try {
      await client.page.goto(`/b/${briefing.token}`);
      await client.page.getByLabel(/Fale-nos do seu negócio/).fill(`Padaria ${run}`);
      // Um site de referência, com a nota.
      await client.page.getByRole('button', { name: 'Site de referência' }).click();
      await client.page.getByLabel('Site de referência 1').fill('www.padariaexemplo.pt');
      await client.page.getByLabel('Nota da referência 1').fill('Gosto destas cores');
      // E uma imagem, também com nota.
      await client.page.getByLabel('Imagens de referência').setInputFiles({ name: 'montra.png', mimeType: 'image/png', buffer: png() });
      await client.page.getByLabel('Nota da referência 2').fill('O balcão assim');
      await client.page.getByRole('button', { name: 'Enviar briefing' }).click();
      await expect(client.page.getByText(/Briefing recebido a/)).toBeVisible();
      await expect(client.page.getByText(/padariaexemplo\.pt — Gosto destas cores/)).toBeVisible();
    } finally {
      await client.context.close();
    }

    // Ficou guardado: um link e uma imagem, cada um com a sua nota.
    const saved = (await (await page.request.get(`/api/v1/leads/${lead.id}/briefing`)).json()).data as {
      references: { kind: string; url: string | null; name: string; note: string }[];
    };
    expect(saved.references).toHaveLength(2);
    expect(saved.references[0]).toMatchObject({ kind: 'link', url: 'https://www.padariaexemplo.pt/', name: 'padariaexemplo.pt', note: 'Gosto destas cores' });
    expect(saved.references[1]).toMatchObject({ kind: 'image', name: 'montra.png', note: 'O balcão assim' });

    // A imagem abre-se pela plataforma (link temporário).
    const image = await page.request.get(`/api/v1/leads/${lead.id}/briefing/references/1`);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/png');

    // E aparecem na ficha, ao lado das respostas.
    await page.goto(`/leads/${lead.id}`);
    await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: /^Trabalho/ }).click();
    await page.getByRole('button', { name: /Ver respostas.*2 referências/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Briefing' });
    const list = dialog.getByRole('list', { name: 'Referências do briefing' });
    await expect(list).toContainText('Gosto destas cores');
    await expect(list).toContainText('O balcão assim');
    await expect(list.getByRole('img', { name: 'montra.png' })).toBeVisible();
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
