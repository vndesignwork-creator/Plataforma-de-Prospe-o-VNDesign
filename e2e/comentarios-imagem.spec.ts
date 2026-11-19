import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Browser } from '@playwright/test';

/*
 * Comentários em cima da imagem das entregas: a equipa junta a imagem e comenta
 * num ponto; o cliente comenta no seu ponto pela página do projeto; os dois veem
 * as marcas numeradas e o que já está resolvido.
 */
const run = Date.now().toString(36);

/** Um PNG verdadeiro de 16×16, cinzento. */
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
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 16 }, () => [180, 180, 180]).flat())]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: 16 }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function anonymous(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test('entregas: comentar em cima da imagem (equipa e cliente)', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, deliverables: true, client_page: true, client_approvals: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Maquete ${run}`, contact_name: 'Ana', status: 'cliente' },
  })).json()).data as { id: string };

  try {
    const created = await page.request.post(`/api/v1/leads/${lead.id}/deliverables`, { data: { title: `Homepage ${run}`, status: 'enviada' } });
    expect(created.status(), await created.text()).toBe(201);
    const deliverable = (await created.json()).data as { id: string; image_name: string | null; pins: number };
    expect(deliverable.image_name).toBeNull();
    expect(deliverable.pins).toBe(0);

    // Sem imagem não se pode comentar.
    const tooSoon = await page.request.post(`/api/v1/deliverables/${deliverable.id}/pins`, { data: { x: 10, y: 10, comment: 'olá' } });
    expect(tooSoon.status()).toBe(409);

    // A imagem da entrega.
    const upload = await page.request.post(`/api/v1/deliverables/${deliverable.id}/image`, {
      multipart: { file: { name: 'homepage.png', mimeType: 'image/png', buffer: png() } },
    });
    expect(upload.status(), await upload.text()).toBe(200);
    expect((await upload.json()).data.image_name).toBe('homepage.png');

    // Um ficheiro que não é imagem é recusado.
    const bad = await page.request.post(`/api/v1/deliverables/${deliverable.id}/image`, {
      multipart: { file: { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('não é imagem') } },
    });
    expect(bad.status()).toBe(422);

    // A equipa comenta num ponto, pela ficha.
    await page.goto(`/leads/${lead.id}`);
    await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: /^Trabalho/ }).click();
    await page.getByRole('button', { name: `Ver e comentar a imagem de Homepage ${run}` }).click();
    const dialog = page.getByRole('dialog', { name: `Homepage ${run}` });
    await expect(dialog.getByRole('img', { name: `Entrega Homepage ${run}` })).toBeVisible();
    // A camada das marcas fica por cima da imagem: é nela que se carrega.
    await dialog.getByTestId('camada-comentarios').click({ position: { x: 20, y: 20 } });
    await dialog.getByLabel('Comentário novo').fill('Este botão maior');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByRole('list', { name: 'Comentários na imagem' })).toContainText('Este botão maior');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // O cliente comenta no seu ponto, pela página do projeto.
    const token = (await (await page.request.post(`/api/v1/leads/${lead.id}/project/share`, { data: { enabled: true } })).json()).data.share_token as string;
    const client = await anonymous(browser);
    try {
      await client.page.goto(`/p/${token}`);
      await expect(client.page.getByRole('img', { name: `Entrega Homepage ${run}` })).toBeVisible();
      await expect(client.page.getByText('Este botão maior')).toBeVisible();
      await client.page.getByTestId('camada-comentarios').click({ position: { x: 60, y: 40 } });
      await client.page.getByLabel(`Comentário na imagem de Homepage ${run}`).fill('A foto aqui está esticada');
      await client.page.getByRole('button', { name: 'Enviar comentário' }).click();
      await expect(client.page.getByText('Obrigado! O comentário foi enviado.')).toBeVisible();
    } finally {
      await client.context.close();
    }

    // Os dois comentários estão na entrega; o do cliente traz o nome.
    const pins = (await (await page.request.get(`/api/v1/deliverables/${deliverable.id}/pins`)).json()).data as {
      id: string;
      comment: string;
      author: string;
      author_name: string | null;
      resolved_at: string | null;
    }[];
    expect(pins).toHaveLength(2);
    const fromClient = pins.find((p) => p.author === 'cliente')!;
    expect(fromClient).toMatchObject({ comment: 'A foto aqui está esticada', author_name: 'Ana' });

    // Marcar como resolvido e contar os que faltam.
    const resolved = await page.request.patch(`/api/v1/pins/${fromClient.id}`, { data: { resolved: true } });
    expect(resolved.status()).toBe(200);
    const list = (await (await page.request.get(`/api/v1/leads/${lead.id}/deliverables`)).json()).data as { id: string; pins: number; open_pins: number }[];
    expect(list.find((d) => d.id === deliverable.id)).toMatchObject({ pins: 2, open_pins: 1 });

    // Tirar a imagem leva os comentários.
    const removed = await page.request.delete(`/api/v1/deliverables/${deliverable.id}/image`);
    expect(removed.status()).toBe(200);
    expect((await removed.json()).data.image_name).toBeNull();
    expect(((await (await page.request.get(`/api/v1/deliverables/${deliverable.id}/pins`)).json()).data as unknown[])).toHaveLength(0);
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
