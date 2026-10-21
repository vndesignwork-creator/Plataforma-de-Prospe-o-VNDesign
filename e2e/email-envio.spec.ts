import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/*
 * Enviar emails pela plataforma. Usa o Mailpit do Supabase local como servidor SMTP
 * (127.0.0.1:54325) e lê os emails recebidos pela API dele (http://127.0.0.1:54324).
 */
const run = Date.now().toString(36);
const FROM = `va+${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

type MailpitMessage = { ID: string; Subject: string; To: { Address: string }[]; Attachments: number };

async function mailTo(request: APIRequestContext, address: string, subject: string): Promise<MailpitMessage> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        const list = ((await res.json()).messages ?? []) as MailpitMessage[];
        found = list.find((m) => m.Subject === subject);
        return !!found;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}

async function connectMailpit(page: Page, dailyLimit = 50) {
  const res = await page.request.put('/api/v1/mail-account', {
    data: { provider: 'custom', from_name: 'Va Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false, daily_limit: dailyLimit },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data as { sent_today: number; daily_limit: number };
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.request.delete('/api/v1/mail-account');
  await page.close();
});

test('ligar a conta em Definições → Email de envio e enviar um email de teste', async ({ page }) => {
  await page.request.delete('/api/v1/mail-account');
  await page.goto('/definicoes/email');
  await expect(page.getByRole('heading', { name: 'Email de envio' })).toBeVisible();
  // Gmail é a opção por omissão e mostra como criar a palavra-passe de aplicação.
  await expect(page.getByText('Como criar a palavra-passe de aplicação do Gmail')).toBeVisible();

  await page.getByLabel('Serviço de email').selectOption({ label: 'Outro (SMTP)' });
  await page.getByLabel('Nome que o cliente vê').fill('Va Teste');
  await page.getByLabel('O teu email').fill(FROM);
  await page.getByLabel('Servidor SMTP').fill('127.0.0.1');
  await page.getByRole('spinbutton', { name: 'Porta', exact: true }).fill('54325');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Conta de email guardada.')).toBeVisible();
  await expect(page.getByText(/Ligada · hoje \d+ de 50/)).toBeVisible();

  await page.getByRole('button', { name: 'Enviar email de teste' }).click();
  await expect(page.getByText(`Email de teste enviado para ${FROM}.`)).toBeVisible();
  await mailTo(page.request, FROM, 'Teste — VNDesign Leads');

  // A palavra-passe nunca volta na API.
  const account = (await (await page.request.get('/api/v1/mail-account')).json()).data;
  expect(account).not.toHaveProperty('password');
  expect(account).not.toHaveProperty('password_ciphertext');
});

test('enviar o email de prospeção da ficha: chega, fica na linha do tempo e o lead passa a Contactado', async ({ page }) => {
  await connectMailpit(page);
  const to = `cliente-${run}@exemplo.pt`;
  const subject = `Uma ideia para a Pastelaria ${run}`;
  const lead = await createLead(page.request, {
    company_name: `Pastelaria Email ${run}`,
    email: to,
    email_subject: subject,
    email_body: `Boa tarde,\n\nVi o vosso site em https://exemplo.pt e tenho uma ideia.\n\nCumprimentos,`,
  });

  await page.goto(`/leads/${lead.id}`);
  // Cabeçalho do cartão "Email de prospeção" (título + ações).
  const header = page.getByRole('heading', { name: 'Email de prospeção' }).locator('xpath=../..');
  await header.getByRole('button', { name: 'Enviar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Enviar email' });
  await expect(dialog.getByText(`De: Va Teste <${FROM}>`)).toBeVisible();
  await expect(dialog.getByLabel('Para')).toHaveValue(to);
  await expect(dialog.getByLabel('Assunto')).toHaveValue(subject);
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(new RegExp(`Email enviado para ${to}\\. Estado atualizado`))).toBeVisible();

  const message = await mailTo(page.request, to, subject);
  const full = (await (await page.request.get(`${MAILPIT}/message/${message.ID}`)).json()) as { HTML: string; From: { Name: string; Address: string } };
  expect(full.From).toMatchObject({ Name: 'Va Teste', Address: FROM });
  expect(full.HTML).toContain('<a href="https://exemplo.pt">https://exemplo.pt</a>');

  const updated = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data;
  expect(updated.status).toBe('contactado');
  expect(updated.channel).toBe('email');
  await expect(page.getByLabel('Atividade do lead').getByText(`Enviado pela plataforma para ${to}`)).toBeVisible();
});

test('lista "não contactar", limite diário e proposta com o PDF em anexo', async ({ page }) => {
  const account = await connectMailpit(page);
  const domain = `naocontactar-${run}.pt`;
  const blocked = await createLead(page.request, { company_name: `Bloqueada ${run}`, email: `geral@${domain}` });
  await page.request.post('/api/v1/do-not-contact', { data: { company_name: `Outra ${run}`, email: `geral@${domain}` } });
  const refused = await page.request.post(`/api/v1/leads/${blocked.id}/email`, { data: { to: `geral@${domain}`, subject: 'Olá', body: 'Teste' } });
  expect(refused.status()).toBe(422);
  expect((await refused.json()).title).toBe('Empresa na lista "não contactar"');

  // Proposta com o PDF em anexo.
  const to = `proposta-${run}@exemplo.pt`;
  const lead = await createLead(page.request, { company_name: `Clínica Proposta ${run}`, email: to });
  const proposal = (
    await (
      await page.request.post(`/api/v1/leads/${lead.id}/proposals`, { data: { title: 'Site institucional', items: [{ name: 'Site', price: 900 }] } })
    ).json()
  ).data;
  const subject = `Proposta ${proposal.code} — Clínica Proposta ${run}`;
  const sent = await page.request.post(`/api/v1/proposals/${proposal.id}/email`, { data: { to, subject, body: 'Segue em anexo a proposta.\n\nCumprimentos,' } });
  expect(sent.status()).toBe(200);
  const message = await mailTo(page.request, to, subject);
  expect(message.Attachments).toBe(1);
  const updatedProposal = (await (await page.request.get(`/api/v1/proposals/${proposal.id}`)).json()).data;
  expect(updatedProposal.status).toBe('enviada');
  expect((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data.status).toBe('proposta_enviada');

  // Limite diário: com o limite igual aos já enviados, o próximo é recusado.
  const now = (await (await page.request.get('/api/v1/mail-account')).json()).data.sent_today as number;
  expect(now).toBeGreaterThan(account.sent_today);
  await connectMailpit(page, now);
  const limited = await page.request.post(`/api/v1/leads/${lead.id}/email`, { data: { to, subject: 'Mais um', body: 'Teste' } });
  expect(limited.status()).toBe(429);
});
