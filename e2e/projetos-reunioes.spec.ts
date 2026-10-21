import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/*
 * Relatório de diagnóstico em PDF, pagamentos + Projetos, reuniões (convite .ics)
 * e cópia de segurança semanal — cada um pode desligar-se em Definições → Funcionalidades.
 * Emails: Mailpit do Supabase local (SMTP 127.0.0.1:54325, API :54324).
 */
const run = Date.now().toString(36);
const FROM = `va+proj${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

function localEnv(name: string): string | undefined {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data;

async function connectAccount(page: Page) {
  const res = await page.request.put('/api/v1/mail-account', {
    data: { provider: 'custom', from_name: 'Va Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false, reply_detection: false },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function mailTo(request: APIRequestContext, address: string, subject: RegExp) {
  let found: { ID: string; Subject: string; Attachments: number } | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        found = (((await res.json()).messages ?? []) as { ID: string; Subject: string; Attachments: number }[]).find((m) => subject.test(m.Subject));
        return !!found;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}

/** Uma análise do site já feita (sem ir à internet): direto na base de dados. */
async function insertAudit(request: APIRequestContext, workspaceId: string, leadId: string) {
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY')!;
  const res = await request.post(`${url}/rest/v1/site_audits`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: {
      workspace_id: workspaceId,
      lead_id: leadId,
      url: `https://padaria-${run}.pt`,
      status: 'done',
      https: false,
      has_viewport: false,
      pagespeed_mobile: 31,
      response_ms: 2300,
      issues: [
        { code: 'no_https', severity: 'high', message: 'O site não usa HTTPS.', short: 'Sem HTTPS' },
        { code: 'pagespeed_low', severity: 'high', message: 'PageSpeed no telemóvel muito baixo (31/100).', short: 'PageSpeed 31' },
        { code: 'no_viewport', severity: 'medium', message: 'Não está adaptado ao telemóvel.', short: 'Não adaptado ao telemóvel' },
        { code: 'outdated_copyright', severity: 'low', message: 'Rodapé com © 2016.', short: '© 2016' },
      ],
    },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.request.delete('/api/v1/mail-account');
  await page.request.patch('/api/v1/settings', {
    data: { features: { diagnosis_report: true, payments: true, meetings: true, projects: true }, weekly_backup: { enabled: true, recipient: null, weekday: 1 } },
  });
  await page.close();
});

test('relatório de diagnóstico: PDF a partir da análise, enviar em anexo e desligar', async ({ page }) => {
  await connectAccount(page);
  const me = (await (await page.request.get('/api/v1/me')).json()).data;
  const to = `geral@padaria-${run}.pt`;
  const lead = await createLead(page.request, { company_name: `Padaria Diagnóstico ${run}`, email: to, website: `https://padaria-${run}.pt` });
  // Sem análise: não há relatório.
  expect((await page.request.get(`/api/v1/leads/${lead.id}/diagnosis-pdf`)).status()).toBe(422);
  await insertAudit(page.request, me.workspace_id ?? me.workspace?.id, lead.id);

  const pdf = await page.request.get(`/api/v1/leads/${lead.id}/diagnosis-pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');

  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('link', { name: 'Relatório PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Enviar email' });
  await expect(dialog.getByLabel('Anexar o relatório de diagnóstico do site (PDF)')).toBeChecked();
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(new RegExp(`Email enviado para ${to}`))).toBeVisible();
  const message = await mailTo(page.request, to, /Diagnóstico do site/);
  expect(message.Attachments).toBe(1);

  // Desligado: sem botões e a API recusa.
  await page.request.patch('/api/v1/settings', { data: { features: { diagnosis_report: false } } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Diagnóstico do site' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Relatório PDF' })).toHaveCount(0);
  expect((await page.request.get(`/api/v1/leads/${lead.id}/diagnosis-pdf`)).status()).toBe(422);
  await page.request.patch('/api/v1/settings', { data: { features: { diagnosis_report: true } } });
});

test('pagamentos e Projetos: plano 50/50, receber o sinal, concluir o projeto', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Clínica Projeto ${run}`, status: 'cliente', estimated_value: 1500 });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Pagamentos' }) });
  await expect(card.getByLabel('Total (€)')).toHaveValue('1500');
  await card.getByRole('button', { name: 'Criar plano' }).click();
  await expect(page.getByText('Plano de pagamentos criado.')).toBeVisible();
  const list = card.getByRole('list', { name: 'Pagamentos do cliente' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await list.getByRole('checkbox', { name: 'Pago: Sinal (50%)' }).check();
  await expect(page.getByText(/Pagamento recebido: 750,00\s€/)).toBeVisible();
  await expect(card.getByText(/Recebido 750,00\s€ de 1500,00\s€/)).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Pagamento recebido')).toBeVisible();

  const billing = (await (await page.request.get('/api/v1/dashboard/billing')).json()).data;
  expect(billing.received_month).toBeGreaterThanOrEqual(750);
  expect(billing.outstanding).toBeGreaterThanOrEqual(750);

  await page.goto('/projetos');
  const active = page.getByRole('list', { name: 'Projetos em curso' });
  const row = active.getByRole('listitem').filter({ hasText: `Clínica Projeto ${run}` });
  await expect(row.getByText(/750\s€ de 1500\s€/)).toBeVisible();
  await expect(row.getByRole('link', { name: 'Usar um modelo de tarefas' })).toBeVisible();
  await row.getByRole('button', { name: 'Concluir projeto' }).click();
  const wrapUp = page.getByRole('dialog', { name: 'Concluir o projeto' });
  await wrapUp.getByLabel(/Juntar o projeto ao portefólio/).uncheck();
  await wrapUp.getByLabel(/propor um novo serviço/).uncheck();
  await wrapUp.getByRole('button', { name: 'Concluir projeto' }).click();
  await expect(page.getByText('Projeto concluído. 🎉')).toBeVisible();
  await page.getByRole('dialog', { name: 'Projeto concluído 🎉' }).getByRole('button', { name: 'Fechar' }).first().click();
  await expect(active.getByText(`Clínica Projeto ${run}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluídos' }).click();
  await expect(page.getByRole('list', { name: 'Projetos concluídos' }).getByText(`Clínica Projeto ${run}`)).toBeVisible();
  expect((await getLead(page.request, lead.id)).project_completed_at).not.toBeNull();

  // Desligar Projetos tira-os do menu; desligar pagamentos tira o cartão da ficha.
  await page.request.patch('/api/v1/settings', { data: { features: { projects: false, payments: false } } });
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('heading', { name: 'Pagamentos' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Projetos' })).toHaveCount(0);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, payments: true } } });
});

test('reunião: marcar com convite (.ics), aparece em Hoje, lembrete e desmarcar avisando o cliente', async ({ page, request }) => {
  await connectAccount(page);
  const to = `cliente@reuniao-${run}.pt`;
  const lead = await createLead(page.request, { company_name: `Oficina Reunião ${run}`, email: to, status: 'respondeu' });

  const day = new Date(Date.now() + 2 * 86_400_000);
  const dd = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric' }).format(day);
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Marcar reunião' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar reunião' });
  await dialog.getByLabel('Dia e hora').fill(`${dd} 10:00`);
  await dialog.getByLabel('Local ou link').fill('https://meet.google.com/abc-defg-hij');
  await expect(dialog.getByLabel('Enviar o convite ao cliente por email (entra no calendário dele)')).toBeChecked();
  await dialog.getByRole('button', { name: 'Marcar' }).click();
  await expect(page.getByText(new RegExp(`Reunião marcada para .*Convite enviado para ${to}\\. Estado: Reunião\\.`))).toBeVisible();

  const updated = await getLead(page.request, lead.id);
  expect(updated).toMatchObject({ status: 'reuniao', next_action_text: 'Reunião às 10:00' });
  const invite = await mailTo(page.request, to, /^Reunião marcada/);
  const raw = await (await page.request.get(`${MAILPIT}/message/${invite.ID}/raw`)).text();
  expect(raw).toContain('BEGIN:VCALENDAR');
  expect(raw).toContain('METHOD:REQUEST');

  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Reuniões' }).getByText(`Oficina Reunião ${run}`)).toBeVisible();

  // .ics para o próprio calendário.
  const meetings = (await (await page.request.get(`/api/v1/leads/${lead.id}/meetings`)).json()).data;
  const ics = await page.request.get(`/api/v1/meetings/${meetings[0].id}/ics`);
  expect(ics.headers()['content-type']).toContain('text/calendar');

  // Lembrete: uma reunião daqui a 30 minutos entra no cron.
  const soon = await page.request.post(`/api/v1/leads/${lead.id}/meetings`, {
    data: { starts_at: new Date(Date.now() + 30 * 60_000).toISOString(), duration_min: 15 },
  });
  expect(soon.status()).toBe(201);
  const soonId = (await soon.json()).data.meeting.id;
  if (process.env.CRON_SECRET) {
    const cron = await request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect((await cron.json()).meetings.map((m: { meeting_id: string }) => m.meeting_id)).toContain(soonId);
  }

  // Desmarcar avisando: o cliente recebe o cancelamento.
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Reuniões' }) });
  await card.getByRole('listitem').filter({ hasText: 'meet.google.com' }).getByRole('button', { name: 'Desmarcar a reunião' }).click();
  await page.getByRole('button', { name: 'Desmarcar e avisar o cliente' }).click();
  await expect(page.getByText('Reunião desmarcada. O cliente foi avisado.')).toBeVisible();
  const cancel = await mailTo(page.request, to, /^Reunião desmarcada/);
  expect(await (await page.request.get(`${MAILPIT}/message/${cancel.ID}/raw`)).text()).toContain('METHOD:CANCEL');
});

test('cópia de segurança: enviar agora (Excel em anexo) e o dia da semana', async ({ page }) => {
  await connectAccount(page);
  const recipient = `copia-${run}@vndesign.pt`;
  await page.goto('/definicoes/funcionalidades');
  await expect(page.getByRole('switch', { name: /Relatório de diagnóstico em PDF/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Enviar para').fill(recipient);
  await page.getByLabel('Dia da semana').selectOption({ label: 'Sexta-feira' });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Cópia de segurança guardada.')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar uma cópia agora' }).click();
  await expect(page.getByText(new RegExp(`Cópia enviada para ${recipient} \\(\\d+ leads\\)\\.`))).toBeVisible();
  const message = await mailTo(page.request, recipient, /^Cópia de segurança dos leads/);
  expect(message.Attachments).toBe(1);
  await expect(page.getByText(/Última cópia enviada: \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  const settings = (await (await page.request.get('/api/v1/settings')).json()).data;
  expect(settings.weekly_backup).toMatchObject({ enabled: true, recipient, weekday: 5 });
  expect(settings.weekly_backup.last_sent_at).not.toBeNull();

  // Desligar no interruptor do cartão.
  await page.getByRole('switch', { name: 'Desligar a cópia de segurança semanal' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Cópia de segurança guardada.')).toBeVisible();
  expect((await (await page.request.get('/api/v1/settings')).json()).data.weekly_backup.enabled).toBe(false);
});
