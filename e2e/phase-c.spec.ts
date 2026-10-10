import { expect, test } from '@playwright/test';

const run = Date.now().toString(36);

test('modelo com variáveis → ficha do lead → marcar como enviado agenda o follow-up', async ({ page }) => {
  const leadName = `Cafe Scripts ${run}`;
  const res = await page.request.post('/api/v1/leads', {
    data: { company_name: leadName, city: 'Amadora', contact_name: 'Rita', email: `geral@scripts-${run}.pt`, problems: 'o site não abre no telemóvel.' },
  });
  expect(res.status()).toBe(201);

  // Criar um modelo na biblioteca
  const templateName = `Modelo ${run}`;
  await page.goto('/scripts');
  await page.getByRole('button', { name: 'Novo modelo' }).click();
  await page.getByLabel('Nome').fill(templateName);
  await page.getByLabel('Assunto').fill('Uma ideia para a {{empresa}}');
  await page.getByLabel('Texto').fill('Olá {{contacto|equipa}},\n\nReparei que {{problema}}\n\n{{assinatura}}\n\n{{opt_out}}');
  await page.getByRole('button', { name: 'Criar modelo' }).click();
  await expect(page.getByText('Modelo criado.')).toBeVisible();

  // Na ficha do lead, o modelo aparece preenchido
  await page.goto('/leads');
  await page.getByLabel('Pesquisar leads').fill(leadName);
  await page.getByRole('link', { name: leadName }).click();
  await page.getByLabel('Modelo', { exact: true }).selectOption({ label: templateName });
  await expect(page.getByLabel('Assunto', { exact: true })).toHaveValue(`Uma ideia para a ${leadName}`);
  await expect(page.locator('#script-body')).toHaveValue(/^Olá Rita,\n\nReparei que o site não abre no telemóvel\./);
  await expect(page.locator('#script-body')).toHaveValue(/basta responder a este email\.$/);

  // Editar antes de enviar e marcar como enviado
  await page.locator('#script-body').fill('Texto editado à mão');
  await page.getByRole('button', { name: 'Marcar como enviado' }).click();
  await expect(page.getByText(/Registado\. Estado: Contactado — follow-up a \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('contactado');
  const timeline = page.getByLabel('Atividade do lead');
  await expect(timeline.getByText('Email enviado')).toBeVisible();
  await expect(timeline.getByText(`Modelo: ${templateName}`).first()).toBeVisible();
});

test('follow-up feito e adiado a partir da ficha e do dashboard', async ({ page }) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
  const name = `Follow Hoje ${run}`;
  const res = await page.request.post('/api/v1/leads', {
    data: { company_name: name, next_action_text: 'Ligar ao gerente', next_action_on: today },
  });
  const lead = (await res.json()).data;

  await page.goto('/dashboard');
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Adiar \d+ dias/ }).click();
  await expect(page.getByText(new RegExp(`#${lead.number} adiado para \\d{2}/\\d{2}/\\d{4}`))).toBeVisible();

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Follow-up' }).click();
  await page.getByRole('menuitem', { name: 'Feito — sem próxima ação' }).click();
  await expect(page.getByText('Feito. Sem próxima ação.')).toBeVisible();
  const timeline = page.getByLabel('Atividade do lead');
  await expect(timeline.getByText('Follow-up feito')).toBeVisible();
  await expect(timeline.getByText(/^Adiado: Ligar ao gerente para/)).toBeVisible();
});

test('assinatura nas definições aparece nos modelos', async ({ page }) => {
  const phone = `+351 91${run.slice(-7).replace(/\D/g, '0').padEnd(7, '0')}`;
  await page.goto('/definicoes');
  await page.getByLabel('Telefone').fill(phone);
  await expect(page.getByText(phone).last()).toBeVisible(); // pré-visualização
  await page.getByRole('button', { name: 'Guardar assinatura' }).click();
  await expect(page.getByText('Assinatura guardada.')).toBeVisible();

  const sig = await (await page.request.get('/api/v1/signature')).json();
  expect(sig.data.phone).toBe(phone);
});

test.describe('resumo diário por email', () => {
  test.skip(!process.env.MAILPIT_URL, 'Defina MAILPIT_URL (ex.: http://127.0.0.1:54324) para testar o envio.');

  test('envio de teste chega à caixa de correio (Mailpit)', async ({ page, request }) => {
    await page.goto('/definicoes/lembretes');
    await page.getByLabel('Enviar o resumo diário').check();
    await page.getByRole('button', { name: 'Guardar definições' }).click();
    await expect(page.getByText('Definições guardadas.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar um resumo de teste agora' }).click();
    await expect(page.getByText(/Resumo de teste enviado para/)).toBeVisible();

    const inbox = await (await request.get(`${process.env.MAILPIT_URL}/api/v1/messages?limit=5`)).json();
    expect(inbox.messages.some((m: { Subject: string }) => m.Subject.startsWith('VNDesign Leads ·'))).toBe(true);
  });

  test('o endpoint do cron exige o segredo', async ({ request }) => {
    expect((await request.get('/api/v1/cron/daily-digest')).status()).toBe(401);
    if (process.env.CRON_SECRET) {
      const res = await request.get('/api/v1/cron/daily-digest?dry_run=true', {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      expect(res.status()).toBe(200);
    }
  });
});

test('lead sem email: "Abrir no email" continua disponível e explica porquê', async ({ page }) => {
  const res = await page.request.post('/api/v1/leads', { data: { company_name: `Sem Email ${run}` } });
  const lead = (await res.json()).data;
  await page.goto(`/leads/${lead.id}`);
  await page.getByLabel('Modelo', { exact: true }).selectOption({ label: 'Email frio — diagnóstico' });
  await expect(page.getByRole('button', { name: 'Abrir no email' }).first()).toBeEnabled();
  await expect(page.getByText('Este lead não tem email — “Abrir no email” abre a mensagem sem destinatário.')).toBeVisible();
});
