import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Logótipo na assinatura: escolhe-se em Definições → Assinatura (qualquer imagem
 * passa a PNG no browser) e vai embutido por baixo da assinatura nos emails aos
 * leads — só quando a assinatura está no email. Usa o Mailpit do Supabase local.
 */
const run = Date.now().toString(36);
const FROM = `va+logo-${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

type MailpitMessage = { ID: string; Subject: string };
type MailpitFull = { HTML: string; Inline: { ContentID: string; ContentType: string }[]; Attachments: unknown[] };

async function mailTo(request: APIRequestContext, address: string, subject: string): Promise<MailpitFull> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        found = (((await res.json()).messages ?? []) as MailpitMessage[]).find((m) => m.Subject === subject);
        return !!found;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return (await (await request.get(`${MAILPIT}/message/${found!.ID}`)).json()) as MailpitFull;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#ef5c32"/><text x="20" y="65" font-size="48" fill="#fff">VND</text></svg>`;

let before: Record<string, unknown> | null = null;
let hadAvatar = true;

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.request.delete('/api/v1/signature/logo');
  if (!hadAvatar) await page.request.delete('/api/v1/me/avatar');
  await page.request.delete('/api/v1/mail-account');
  if (before) {
    const { full_name, role_title, company, phone, email, website, portfolio_url, project_links } = before;
    await page.request.put('/api/v1/signature', {
      data: { full_name, role_title, company, phone, email, website, portfolio_url, project_links, logo_width: 160 },
    });
  }
  await page.close();
});

test('logótipo na assinatura: escolher, tamanho, vai embutido no email por baixo da assinatura', async ({ page }) => {
  before = (await (await page.request.get('/api/v1/signature')).json()).data;
  const sig = { full_name: `Ana Logo ${run}`, role_title: 'Web Designer', company: 'VNDesign', phone: '912 345 678', website: 'https://vndesign.pt' };
  expect((await page.request.put('/api/v1/signature', { data: sig })).status()).toBe(200);

  // Escolher (um SVG: o browser converte para PNG) e mudar o tamanho.
  await page.goto('/definicoes/assinatura');
  await page.getByLabel('Escolher logótipo').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
  await expect(page.getByText('Logótipo guardado.')).toBeVisible();
  const preview = page.getByRole('complementary', { name: 'Pré-visualização da assinatura' }).getByRole('img', { name: 'Logótipo da assinatura' });
  await expect(preview).toBeVisible();
  await expect.poll(async () => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(300);
  await page.getByRole('radiogroup', { name: 'Tamanho do logótipo' }).getByLabel('Grande').check();
  await page.getByRole('button', { name: 'Guardar assinatura' }).click();
  await expect(page.getByText('Assinatura guardada.')).toBeVisible();
  await expect.poll(async () => Math.round((await preview.boundingBox())!.width)).toBe(220);
  await page.screenshot({ path: 'test-results/assinatura-logotipo.png' });

  const saved = (await (await page.request.get('/api/v1/signature')).json()).data;
  expect(saved).toMatchObject({ logo_width: 220, logo_url: expect.stringMatching(/^\/api\/v1\/signature\/logo\?v=\d+$/) });
  const image = await page.request.get(saved.logo_url);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');

  // Email com a assinatura: o logótipo vai embutido (cid:) logo a seguir à última linha, com link para o site.
  expect(
    (
      await page.request.put('/api/v1/mail-account', {
        data: { provider: 'custom', from_name: 'Ana', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false, daily_limit: 50 },
      })
    ).status(),
  ).toBe(200);
  const to = `logo-${run}@exemplo.pt`;
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Logo Email ${run}`, email: to } })).json()).data;
  const signed = await page.request.post(`/api/v1/leads/${lead.id}/email`, {
    data: {
      to,
      subject: `Com logo ${run}`,
      body: `Olá,\n\nUma ideia para o vosso site.\n\nCumprimentos,\nAna Logo ${run}\nWeb Designer · VNDesign\n912 345 678 · vndesign.pt`,
    },
  });
  expect(signed.status(), await signed.text()).toBe(200);
  const withLogo = await mailTo(page.request, to, `Com logo ${run}`);
  expect(withLogo.Inline).toHaveLength(1);
  expect(withLogo.Inline[0]!.ContentType).toBe('image/png');
  expect(withLogo.Attachments).toHaveLength(0);
  expect(withLogo.HTML).toMatch(/912 345 678 · vndesign\.pt<br><a href="[^"]+"[^>]*><img src="cid:logotipo-assinatura@vndesign-leads"[^>]*width="220"/);

  // Sem a assinatura no email: sem logótipo.
  const plain = await page.request.post(`/api/v1/leads/${lead.id}/email`, { data: { to, subject: `Sem logo ${run}`, body: 'Obrigada pela resposta!' } });
  expect(plain.status()).toBe(200);
  const withoutLogo = await mailTo(page.request, to, `Sem logo ${run}`);
  expect(withoutLogo.Inline).toHaveLength(0);
  expect(withoutLogo.HTML).not.toContain('cid:');

  // Tirar o logótipo.
  await page.getByRole('button', { name: 'Tirar logótipo' }).click();
  await expect(page.getByText('Logótipo tirado.')).toBeVisible();
  await expect(preview).toHaveCount(0);
  expect((await (await page.request.get('/api/v1/signature')).json()).data.logo_url).toBeNull();
});

test('a foto do perfil passa a logótipo da assinatura e vice-versa', async ({ page }) => {
  const me = (await (await page.request.get('/api/v1/me/profile')).json()).data as { avatar_url: string | null };
  hadAvatar = !!me.avatar_url;
  await page.request.delete('/api/v1/me/avatar');
  await page.request.delete('/api/v1/signature/logo');

  // Logótipo → foto do perfil (o logótipo cabe inteiro no círculo).
  await page.goto('/definicoes/assinatura');
  await expect(page.getByRole('button', { name: 'Usar a foto do perfil' })).toHaveCount(0);
  await page.getByLabel('Escolher logótipo').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
  await expect(page.getByText('Logótipo guardado.')).toBeVisible();
  await page.goto('/definicoes/conta');
  await page.getByRole('button', { name: 'Usar o logótipo da assinatura' }).click();
  await expect(page.getByText('Foto guardada.')).toBeVisible();
  const avatar = (await (await page.request.get('/api/v1/me/profile')).json()).data.avatar_url as string;
  expect(avatar).toMatch(/^\/api\/v1\/avatars\//);

  // Foto do perfil → logótipo da assinatura.
  await page.request.delete('/api/v1/signature/logo');
  await page.goto('/definicoes/assinatura');
  await page.getByRole('button', { name: 'Usar a foto do perfil' }).click();
  await expect(page.getByText('Logótipo guardado.')).toBeVisible();
  const logo = (await (await page.request.get('/api/v1/signature')).json()).data.logo_url as string;
  const image = await page.request.get(logo);
  expect(image.headers()['content-type']).toBe('image/png');
  await expect(page.getByRole('complementary', { name: 'Pré-visualização da assinatura' }).getByRole('img', { name: 'Logótipo da assinatura' })).toBeVisible();
});
