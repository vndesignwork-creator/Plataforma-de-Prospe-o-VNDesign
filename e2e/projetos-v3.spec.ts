import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

/*
 * Arranque automático do projeto, despesas e lucro, rentabilidade, calendário
 * subscrito, contratos aceites online, aprovação na página do cliente e
 * briefing online com ficheiros.
 */
const run = Date.now().toString(36);
// Dias de calendário em Lisboa (somar 24 h falha na mudança de hora).
const iso = (days: number) => {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number };
}

/** Uma página sem sessão (o cliente). */
async function anonymous(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

/** Ficha do cliente: as partes do projeto estão em separadores (Trabalho e entregas | Tempo e dinheiro | Cliente e equipa). */
async function projectTab(page: import('@playwright/test').Page, name: string) {
  await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

test('arranque: ao passar a Cliente, prazo, revisões, tarefas e plano de pagamentos', async ({ page }) => {
  // O prazo vem do serviço: outros testes mudam os serviços, por isso fixa-se aqui (30 dias, 2 revisões).
  const services = (await (await page.request.get('/api/v1/services')).json()).data as { id: string; key: string }[];
  for (const [key, days] of [['site_institucional', 30], ['identidade_visual', 21]] as const) {
    const service = services.find((s) => s.key === key)!;
    expect((await page.request.patch(`/api/v1/services/${service.id}`, { data: { delivery_days: days, revisions_included: 2 } })).ok()).toBe(true);
  }
  const lead = await createLead(page.request, { company_name: `Arranque ${run}`, services: ['site_institucional'], status: 'proposta_enviada', estimated_value: 900 });
  const res = await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { status: 'cliente' } });
  expect(res.status(), await res.text()).toBe(200);

  const info = (await (await page.request.get(`/api/v1/leads/${lead.id}/project`)).json()).data;
  expect(info).toMatchObject({ due_on: iso(30), revisions_included: 2 });
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as unknown[];
  expect(tasks.length).toBeGreaterThan(0);
  const payments = (await (await page.request.get(`/api/v1/leads/${lead.id}/payments`)).json()).data as { description: string; amount: number }[];
  expect(payments.map((p) => [p.description, p.amount])).toEqual([
    ['Sinal (50%)', 450],
    ['Entrega (50%)', 450],
  ]);
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string }[];
  expect(activities.some((a) => a.type === 'project_started')).toBe(true);

  // Um cliente antigo (criado já como cliente): "Preparar" na ficha.
  const old = await createLead(page.request, { company_name: `Cliente Antigo ${run}`, services: ['identidade_visual'], status: 'cliente' });
  await page.goto(`/leads/${old.id}`);
  await page.locator('#projeto').getByRole('button', { name: 'Mais ações do projeto' }).click();
  await page.getByRole('menuitem', { name: /^Preparar/ }).click();
  await expect(page.getByText(/Projeto preparado: \d+ tarefas \(Identidade Visual\) · entrega a/)).toBeVisible();
  await expect(page.locator('#projeto').getByText('Faltam 21 dias')).toBeVisible();
});

test('despesas e lucro; rentabilidade nas Estatísticas', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Despesas ${run}`, status: 'cliente', estimated_value: 900 });
  await page.request.post(`/api/v1/leads/${lead.id}/time`, { data: { date: iso(0), minutes: 120 } });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#projeto');
  await projectTab(page, 'Tempo e dinheiro');
  await card.getByRole('button', { name: 'Despesa', exact: true }).click();
  await card.getByLabel('Descrição da despesa').fill('Alojamento (1 ano)');
  await card.getByLabel('Valor (€)').fill('100');
  await card.getByRole('button', { name: 'Acrescentar' }).click();
  await expect(page.getByText('Despesa registada.')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Despesas do projeto' }).getByText('Alojamento (1 ano)')).toBeVisible();
  await expect(card.getByText(/800,00\s€/)).toBeVisible();
  await expect(card.getByText(/400\s€\/h/)).toBeVisible();

  const stats = (await (await page.request.get('/api/v1/stats/profitability')).json()).data;
  const row = stats.by_client.find((c: { lead: { id: string } }) => c.lead.id === lead.id);
  expect(row).toMatchObject({ minutes: 120, value: 900, expenses: 100, rate: 450, net_rate: 400 });
  expect(stats.monthly).toHaveLength(12);
  await page.goto('/estatisticas');
  await expect(page.getByRole('heading', { name: 'Rentabilidade' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ganho por hora por cliente' }).getByText(`Despesas ${run}`)).toBeVisible();
});

test('calendário subscrito: link .ics sem sessão com as reuniões; desligar', async ({ page, request }) => {
  const lead = await createLead(page.request, { company_name: `Calendário ${run}`, status: 'respondeu' });
  const meeting = await page.request.post(`/api/v1/leads/${lead.id}/meetings`, {
    data: { starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), duration_min: 45, location: 'Google Meet' },
  });
  expect(meeting.status()).toBe(201);
  await page.goto('/definicoes/funcionalidades');
  // Espera pelo estado real (ligado ou não) antes de decidir o que carregar.
  await page.waitForLoadState('networkidle');
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Calendário no telemóvel' }) });
  if (await card.getByRole('button', { name: 'Desligar' }).count()) await card.getByRole('button', { name: 'Desligar' }).click();
  await card.getByRole('button', { name: 'Criar link' }).click();
  const url = await card.getByLabel('Link do calendário').inputValue();
  expect(url).toMatch(/\/api\/v1\/calendar\/[A-Za-z0-9_-]{24}\.ics$/);
  await expect(card.getByRole('link', { name: /Abrir no iPhone/ })).toHaveAttribute('href', url.replace(/^https?:/, 'webcal:'));

  const ics = await request.get(url, { headers: { Cookie: '' } });
  expect(ics.status()).toBe(200);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain(`SUMMARY:Reunião · Calendário ${run}`);

  await card.getByRole('button', { name: 'Desligar' }).click();
  await expect(card.getByRole('button', { name: 'Criar link' })).toBeVisible();
  expect((await request.get(url)).status()).toBe(404);
});

test('contrato: gerar, editar, enviar, o cliente aceita online; PDF', async ({ page, browser }) => {
  const name = `Contrato ${run}`;
  const lead = await createLead(page.request, { company_name: name, contact_name: 'Marta Sol', status: 'cliente', estimated_value: 750 });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#contratos');
  await card.getByRole('button', { name: 'Gerar contrato' }).click();
  await page.getByRole('dialog', { name: 'Gerar contrato' }).getByRole('button', { name: 'Gerar' }).click();
  await expect(page.getByText('Contrato gerado. Revê as cláusulas antes de enviar.')).toBeVisible();
  const row = card.getByRole('listitem').first();
  await expect(row.getByText('Rascunho')).toBeVisible();

  await row.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: /Editar contrato/ });
  await dialog.getByRole('group', { name: 'Cliente' }).getByLabel('NIF').fill('501234567');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Contrato guardado.')).toBeVisible();

  await row.getByRole('button', { name: 'Copiar link' }).click();
  await expect(row.getByText('Enviado', { exact: true })).toBeVisible();
  const contracts = (await (await page.request.get(`/api/v1/leads/${lead.id}/contracts`)).json()).data as { id: string; token: string; content: { client: { nif: string } } }[];
  expect(contracts[0]!.content.client.nif).toBe('501234567');
  const pdf = await page.request.get(`/api/v1/contracts/${contracts[0]!.id}/pdf`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');

  const client = await anonymous(browser);
  await client.page.goto(`/c/${contracts[0]!.token}`);
  await expect(client.page.getByRole('heading', { name: `Contrato de prestação de serviços — ${name}` })).toBeVisible();
  await expect(client.page.getByText('NIF 501234567')).toBeVisible();
  await expect(client.page.getByLabel('O seu nome completo')).toHaveValue('Marta Sol');
  await client.page.getByRole('button', { name: 'Aceitar contrato' }).click();
  await expect(client.page.getByText('Confirme que leu e aceita o contrato.')).toBeVisible();
  await client.page.getByLabel('Li o contrato e aceito as condições.').check();
  await client.page.getByRole('button', { name: 'Aceitar contrato' }).click();
  await expect(client.page.getByText(/Contrato aceite por Marta Sol a/)).toBeVisible();
  const publicPdf = await client.page.request.get(`/api/v1/public/contracts/${contracts[0]!.token}/pdf`);
  expect(publicPdf.headers()['content-type']).toBe('application/pdf');
  await client.context.close();

  await page.reload();
  await expect(card.getByText('Aceite pelo cliente')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  expect((await page.request.patch(`/api/v1/contracts/${contracts[0]!.id}`, { data: { title: 'Mudar' } })).status()).toBe(422);
});

test('página do cliente: aprovar uma entrega e pedir alterações (cria revisão)', async ({ page, browser }) => {
  const lead = await createLead(page.request, { company_name: `Aprovação ${run}`, contact_name: 'Rui', status: 'cliente' });
  for (const title of ['Logótipo final', 'Cartão de visita']) {
    const d = await page.request.post(`/api/v1/leads/${lead.id}/deliverables`, { data: { title, url: 'https://drive.google.com/x', status: 'enviada' } });
    expect(d.status()).toBe(201);
  }
  const token = (await (await page.request.post(`/api/v1/leads/${lead.id}/project/share`, { data: { enabled: true } })).json()).data.share_token;

  const client = await anonymous(browser);
  await client.page.goto(`/p/${token}`);
  await client.page.getByRole('button', { name: 'Aprovar: Logótipo final' }).click();
  await expect(client.page.getByText('Obrigado! Entrega aprovada.')).toBeVisible();
  await client.page.getByRole('button', { name: 'Pedir alterações: Cartão de visita' }).click();
  await client.page.getByLabel('O que alterar em Cartão de visita').fill('Trocar o telefone');
  await client.page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(client.page.getByText('Obrigado! O pedido de alterações foi enviado.')).toBeVisible();
  await client.context.close();

  const deliverables = (await (await page.request.get(`/api/v1/leads/${lead.id}/deliverables`)).json()).data as { title: string; status: string }[];
  expect(Object.fromEntries(deliverables.map((d) => [d.title, d.status]))).toEqual({ 'Logótipo final': 'aprovada', 'Cartão de visita': 'rascunho' });
  const revisions = (await (await page.request.get(`/api/v1/leads/${lead.id}/revisions`)).json()).data as { description: string }[];
  expect(revisions.map((r) => r.description)).toEqual(['Cartão de visita: Trocar o telefone']);
});

test('briefing online: o cliente responde e envia ficheiros; a fase passa a Em produção', async ({ page, browser }) => {
  const lead = await createLead(page.request, { company_name: `Briefing ${run}`, contact_name: 'Ana', status: 'cliente' });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#projeto');
  await card.getByRole('button', { name: 'Pedir briefing' }).click();
  await expect(page.getByText('Link do briefing criado.')).toBeVisible();
  const briefing = (await (await page.request.get(`/api/v1/leads/${lead.id}/briefing`)).json()).data;

  const client = await anonymous(browser);
  await client.page.goto(`/b/${briefing.token}`);
  await expect(client.page.getByRole('heading', { name: `Briefing · Briefing ${run}` })).toBeVisible();
  await client.page.getByRole('button', { name: 'Enviar briefing' }).click();
  await expect(client.page.getByText('Responda pelo menos a uma pergunta.')).toBeVisible();
  await client.page.getByLabel(/Fale-nos do seu negócio/).fill(`Padaria artesanal ${run}`);
  await client.page.getByLabel('Ficheiros (opcional)').setInputFiles({ name: 'logo.txt', mimeType: 'text/plain', buffer: Buffer.from(`logo ${run}`) });
  await client.page.getByRole('button', { name: 'Enviar briefing' }).click();
  await expect(client.page.getByText(/Briefing recebido a/)).toBeVisible();
  await expect(client.page.getByText('Já enviados: logo.txt')).toBeVisible();
  await client.context.close();

  const info = (await (await page.request.get(`/api/v1/leads/${lead.id}/project`)).json()).data;
  expect(info.stage).toBe('producao');
  await page.reload();
  await card.getByRole('button', { name: /Ver respostas e 1 ficheiro/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Briefing' });
  await expect(dialog.getByText(`Padaria artesanal ${run}`)).toBeVisible();
  const file = await page.request.get(`/api/v1/leads/${lead.id}/briefing/files/0`);
  expect(file.status()).toBe(200);
  expect(await file.text()).toBe(`logo ${run}`);
});

test('o que falta o cliente enviar: pedir na ficha, o cliente envia pela página, chega o ficheiro', async ({ page, browser }) => {
  const lead = await createLead(page.request, { company_name: `Pedidos ${run}`, contact_name: 'Rita', status: 'cliente' });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#projeto');
  await projectTab(page, 'Trabalho');
  const section = card.getByRole('region', { name: 'O que falta o cliente enviar' });
  await section.getByRole('button', { name: 'Pedir' }).click();
  await section.getByRole('button', { name: '+ Fotografias (espaço, equipa, produtos)' }).click();
  await section.getByLabel('O que falta o cliente enviar').fill('Textos da página Sobre');
  await section.getByRole('button', { name: 'Juntar' }).click();
  await expect(section.getByText('faltam 2 de 2')).toBeVisible();
  const token = (await (await page.request.post(`/api/v1/leads/${lead.id}/project/share`, { data: { enabled: true } })).json()).data.share_token;

  const client = await anonymous(browser);
  await client.page.goto(`/p/${token}`);
  const box = client.page.getByRole('region', { name: 'O que precisamos de si' });
  await expect(box.getByText('Faltam 2 de 2.', { exact: false })).toBeVisible();
  await box.getByRole('button', { name: 'Enviar: Fotografias (espaço, equipa, produtos)' }).click();
  await box.getByLabel('Ficheiros para Fotografias (espaço, equipa, produtos)').setInputFiles({ name: 'loja.txt', mimeType: 'text/plain', buffer: Buffer.from(`foto ${run}`) });
  await box.getByLabel('Nota para Fotografias (espaço, equipa, produtos)').fill('Mais fotos na sexta');
  await box.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(box.getByText('Obrigado! Recebemos o que enviou.')).toBeVisible();
  await expect(box.getByText('Enviado: loja.txt')).toBeVisible();
  await expect(box.getByText('Falta 1 de 2.', { exact: false })).toBeVisible();
  await client.context.close();

  const requests = (await (await page.request.get(`/api/v1/leads/${lead.id}/client-requests`)).json()).data as { id: string; title: string; status: string; client_note: string | null }[];
  const photos = requests.find((r) => r.title.startsWith('Fotografias'))!;
  expect(photos).toMatchObject({ status: 'sent', client_note: 'Mais fotos na sexta' });
  const file = await page.request.get(`/api/v1/client-requests/${photos.id}/files/0`);
  expect(await file.text()).toBe(`foto ${run}`);

  await page.reload();
  await projectTab(page, 'Trabalho');
  await expect(section.getByRole('link', { name: 'loja.txt' })).toBeVisible();
  await section.getByLabel(/^Estado de Fotografias/).selectOption('done');
  await expect(section.getByText('falta 1 de 2')).toBeVisible();
});

test('renovações e avenças: juntar, renovar (regista o pagamento) e receita recorrente nas Estatísticas', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Renovações ${run}`, contact_name: 'Marta', email: `renov-${run}@exemplo.pt`, status: 'cliente' });
  await page.goto(`/leads/${lead.id}`);
  await projectTab(page, 'Tempo');
  const section = page.locator('#projeto').getByRole('region', { name: 'Renovações e avenças' });
  await section.getByRole('button', { name: 'Renovação' }).click();
  await section.getByLabel('Nome').fill(`Domínio renov-${run}.pt`);
  await section.getByLabel('Valor (€)').fill('15,50');
  await section.getByLabel('Próxima renovação').fill(iso(10).split('-').reverse().join('/'));
  await section.getByRole('button', { name: 'Acrescentar' }).click();
  await expect(section.getByText(`Domínio renov-${run}.pt`)).toBeVisible();
  await expect(section.getByText('faltam 10 dias')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Email' })).toBeVisible();

  await section.getByRole('button', { name: 'Renovado' }).click();
  await section.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/Renovado\. Próxima: .*\(pagamento registado\)/)).toBeVisible();
  const [renewal] = (await (await page.request.get(`/api/v1/leads/${lead.id}/renewals`)).json()).data as { next_due_on: string; amount: number }[];
  expect(renewal!.amount).toBe(15.5);
  expect(renewal!.next_due_on.slice(0, 4)).toBe(String(Number(iso(10).slice(0, 4)) + 1));
  const payments = (await (await page.request.get(`/api/v1/leads/${lead.id}/payments`)).json()).data as { amount: number; paid_on: string | null }[];
  expect(payments.some((p) => p.amount === 15.5 && p.paid_on === iso(0))).toBe(true);

  const summary = (await (await page.request.get('/api/v1/renewals/summary')).json()).data as { monthly: number; active: number };
  expect(summary.active).toBeGreaterThan(0);
  await page.goto('/estatisticas#recorrente');
  await expect(page.getByRole('heading', { name: 'Receita recorrente' }).first()).toBeVisible();
});

test('relatório para a contabilidade: números do mês, PDF e Excel', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Contas ${run}`, status: 'cliente' });
  const month = iso(0).slice(0, 7);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/payments`, { data: { description: `Sinal ${run}`, amount: 400, paid_on: iso(0), method: 'MB Way' } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/payments`, { data: { description: `Final ${run}`, amount: 600, due_on: iso(0) } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/expenses`, { data: { description: `Plugin ${run}`, amount: 49.9, spent_on: iso(0) } })).status()).toBe(201);

  const report = (await (await page.request.get(`/api/v1/reports/accounting?month=${month}`)).json()).data as {
    received: { rows: { description: string; amount: number }[] };
    expenses: { rows: { description: string }[] };
    outstanding: { rows: { description: string }[] };
  };
  expect(report.received.rows.some((r) => r.description === `Sinal ${run}` && r.amount === 400)).toBe(true);
  expect(report.expenses.rows.some((r) => r.description === `Plugin ${run}`)).toBe(true);
  expect(report.outstanding.rows.some((r) => r.description === `Final ${run}`)).toBe(true);

  const pdf = await page.request.get(`/api/v1/reports/accounting?month=${month}&format=pdf`);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  const xlsx = await page.request.get(`/api/v1/reports/accounting?month=${month}&format=xlsx`);
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK');
  expect((await page.request.get('/api/v1/reports/accounting?month=2026-13')).status()).toBe(422);

  await page.goto('/estatisticas#contabilidade');
  const card = page.getByRole('heading', { name: 'Relatório para a contabilidade' });
  await expect(card).toBeVisible();
  await page.getByLabel('Mês do relatório').selectOption(month);
  await expect(page.getByRole('link', { name: 'Descarregar PDF' })).toHaveAttribute('href', `/api/v1/reports/accounting?month=${month}&format=pdf`);
});
