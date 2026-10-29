import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Filtros guardados, leads sem próximo passo, reciclagem (apagar e repor com
 * tudo), resumo com IA, nota afixada, cartão de visita, campos personalizados
 * e a comparação com o período anterior. IA falsa em e2e/stubs.ts.
 */
const run = Date.now().toString(36);
// Dias de calendário em Lisboa (somar 24 h falha na mudança de hora).
const iso = (days: number) => {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

type LeadRow = { id: string; number: number; company_name: string; next_action_on: string | null; next_action_text: string | null; pinned_note: string | null; custom: Record<string, unknown> };

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as LeadRow;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data as LeadRow;
const undo = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text }).getByRole('button', { name: 'Anular', exact: true }).click();

test('filtros guardados: guardar, voltar a eles (também no Ctrl+K) e apagar', async ({ page }) => {
  const name = `Contactados ${run}`;
  await page.goto(`/leads?status=contactado&q=${run}`);
  await page.getByRole('button', { name: 'Vistas guardadas' }).click();
  await page.getByRole('menuitem', { name: 'Guardar esta vista…' }).click();
  await page.getByLabel('Nome').fill(name);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText(`Vista guardada como “${name}”.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vistas guardadas' })).toContainText(name);

  await page.goto('/leads');
  await page.getByRole('button', { name: 'Vistas guardadas' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`q=${run}`));
  await expect(page).toHaveURL(/status=contactado/);
  await expect(page.getByLabel('Pesquisar leads')).toHaveValue(run);

  await page.goto('/dashboard');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(`Contactados ${run}`);
  await page.getByRole('option', { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/leads\?.*status=contactado/);

  await page.getByRole('button', { name: 'Vistas guardadas' }).click();
  await page.getByRole('menuitem', { name: `Apagar “${name}”` }).click();
  await expect(page.getByText(`“${name}” apagado.`)).toBeVisible();
});

test('sem próximo passo: aviso no Hoje, filtro na lista e Marcar follow-up com Anular', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Esquecido ${run}`, status: 'respondeu' });
  expect((await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { next_action_on: null, next_action_text: null } })).status()).toBe(200);

  const list = (await (await page.request.get(`/api/v1/leads?due=none&q=${encodeURIComponent(`Esquecido ${run}`)}`)).json()).data as { id: string }[];
  expect(list.map((l) => l.id)).toEqual([lead.id]);

  await page.goto('/dashboard');
  const bar = page.getByRole('status', { name: 'Sem próximo passo' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Marcar follow-up' }).click();
  await page.getByRole('menuitem', { name: /^Amanhã/ }).click();
  await expect.poll(async () => (await getLead(page.request, lead.id)).next_action_on).toBe(iso(1));
  await undo(page, /passaram? para/);
  await expect(page.getByText('Datas repostas.')).toBeVisible();
  expect((await getLead(page.request, lead.id)).next_action_on).toBeNull();
});

test('reciclagem: apagar na ficha, repor com tudo; apagar de vez', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Reciclado ${run}`, status: 'cliente', tags: ['guardar'] });
  expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Tarefa guardada ${run}` } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/payments`, { data: { description: 'Sinal', amount: 300, due_on: iso(5) } })).status()).toBe(201);

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: 'Apagar lead…' }).click();
  const dialog = page.getByRole('dialog', { name: `Apagar #${lead.number}?` });
  await expect(dialog.getByText(/vai para Leads → Apagados/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Apagar', exact: true }).click();
  await expect(page.getByText(`Lead #${lead.number} apagado (fica 30 dias em Apagados).`)).toBeVisible();
  expect((await page.request.get(`/api/v1/leads/${lead.id}`)).status()).toBe(404);

  await page.goto('/leads/apagados');
  const row = page.getByRole('list', { name: 'Leads apagados' }).getByRole('listitem').filter({ hasText: `Reciclado ${run}` });
  await expect(row).toContainText('3 registos guardados');
  await row.getByRole('button', { name: `Repor #${lead.number} Reciclado ${run}` }).click();
  await expect(page.getByText(`#${lead.number} Reciclado ${run} reposto.`)).toBeVisible();
  const back = await getLead(page.request, lead.id);
  expect(back.number).toBe(lead.number);
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string }[];
  expect(tasks.map((t) => t.title)).toContain(`Tarefa guardada ${run}`);
  const payments = (await (await page.request.get(`/api/v1/leads/${lead.id}/payments`)).json()).data as { description: string }[];
  expect(payments.map((p) => p.description)).toEqual(['Sinal']);

  // Apagar de vez (API) e da reciclagem (página).
  expect((await page.request.delete(`/api/v1/leads/${lead.id}`)).status()).toBe(204);
  await page.reload();
  await page.getByRole('button', { name: `Apagar de vez #${lead.number} Reciclado ${run}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar de vez' }).click();
  await expect(page.getByText('Apagado de vez.')).toBeVisible();
  const trash = (await (await page.request.get('/api/v1/leads/trash')).json()).data as { lead_id: string }[];
  expect(trash.some((t) => t.lead_id === lead.id)).toBe(false);
});

test('resumo com IA: abre na ficha; próximo passo e "Afixar na ficha"', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Resumido ${run}`, status: 'respondeu', phone: '912345678' });
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Resumo IA' }).click();
  const dialog = page.getByRole('dialog', { name: `Resumo de Resumido ${run}` });
  await expect(dialog.getByText(/Restaurante em Lisboa sem site/)).toBeVisible();
  await expect(dialog.getByText('Enviar a proposta até sexta.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Usar como próxima ação' }).click();
  await expect(page.getByText('Próxima ação atualizada.')).toBeVisible();
  expect((await getLead(page.request, lead.id)).next_action_text).toBe('Ligar para saber se receberam a proposta');

  await dialog.getByRole('button', { name: 'Afixar na ficha' }).click();
  const pin = page.getByRole('dialog', { name: 'Nota afixada' });
  await expect(pin.getByLabel('Nota afixada')).toHaveValue('Só atende depois das 15h');
  await pin.getByRole('button', { name: 'Afixar' }).click();
  await expect(page.getByText('Nota afixada.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('note', { name: 'Nota afixada' })).toContainText('Só atende depois das 15h');
  expect((await getLead(page.request, lead.id)).pinned_note).toBe('Só atende depois das 15h');
});

test('nota afixada: afixar pelo menu, aparece na Prospeção, editar e tirar', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Afixado ${run}` });
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: 'Afixar uma nota…' }).click();
  await page.getByRole('dialog', { name: 'Nota afixada' }).getByLabel('Nota afixada').fill('Falar com a Marta, não com o sócio');
  await page.getByRole('button', { name: 'Afixar' }).click();
  const note = page.getByRole('note', { name: 'Nota afixada' });
  await expect(note).toContainText('Falar com a Marta');
  await note.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog', { name: 'Nota afixada' }).getByRole('button', { name: 'Tirar' }).click();
  await expect(page.getByText('Nota tirada.')).toBeVisible();
  await expect(note).toHaveCount(0);
  expect((await getLead(page.request, lead.id)).pinned_note).toBeNull();
});

test('cartão de visita: a foto preenche o novo lead (só os campos vazios)', async ({ page }) => {
  await page.goto('/leads/novo');
  const company = page.getByLabel('Empresa', { exact: false }).first();
  await company.fill(`Já escrito ${run}`);
  // PNG de 1×1: a IA falsa "lê" sempre o mesmo cartão.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Fotografia do cartão de visita').setInputFiles({ name: 'cartao.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Cartão lido: revê os dados antes de criar o lead.')).toBeVisible();
  await expect(company).toHaveValue(`Já escrito ${run}`);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('ana@padariaestrela.pt');
  await expect(page.getByLabel('Telefone', { exact: false }).first()).toHaveValue('+351 912 345 678');
});

test('campos personalizados: criar, preencher na ficha, filtrar, exportar e apagar', async ({ page }) => {
  test.setTimeout(120_000);
  const label = `Programa ${run}`;
  await page.goto('/definicoes/campos');
  await page.getByRole('button', { name: 'Novo campo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo campo' });
  await dialog.getByLabel('Nome').fill(label);
  await dialog.getByLabel('Tipo').selectOption('choice');
  await dialog.getByLabel('Opções').fill('Primavera\nMoloni');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(`Campo “${label}” criado.`)).toBeVisible();
  const fields = (await (await page.request.get('/api/v1/custom-fields')).json()).data as { id: string; key: string; label: string }[];
  const field = fields.find((f) => f.label === label)!;

  const a = await createLead(page.request, { company_name: `Campo A ${run}` });
  const b = await createLead(page.request, { company_name: `Campo B ${run}` });
  await page.goto(`/leads/${a.id}`);
  await page.getByLabel(label).selectOption('Moloni');
  await expect.poll(async () => (await getLead(page.request, a.id)).custom).toEqual({ [field.key]: 'Moloni' });
  // Valor que não é uma das opções não entra.
  expect((await page.request.patch(`/api/v1/leads/${b.id}`, { data: { custom: { [field.key]: 'Sage' } } })).status()).toBe(200);
  expect((await getLead(page.request, b.id)).custom).toEqual({});

  await page.goto(`/leads?q=${run}`);
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Moloni' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/^1 lead com estes filtros/)).toBeVisible();
  await expect(page.getByRole('link', { name: `Campo A ${run}` }).first()).toBeVisible();

  const csv = await (await page.request.get(`/api/v1/leads/export?format=csv&q=${encodeURIComponent(`Campo A ${run}`)}`)).text();
  expect(csv).toContain(label);
  expect(csv).toContain('Moloni');

  await page.goto('/definicoes/campos');
  await page.getByRole('button', { name: `Apagar ${label}` }).click();
  await page.getByRole('button', { name: 'Apagar campo' }).click();
  await expect(page.getByText(`Campo “${label}” apagado.`)).toBeVisible();
  expect((await getLead(page.request, a.id)).custom).toEqual({});
});

test('estatísticas: este mês vs. o mês passado e por semana', async ({ page }) => {
  await createLead(page.request, { company_name: `Estatística ${run}` });
  const week = (await (await page.request.get('/api/v1/stats/compare?period=week')).json()).data as { metrics: { key: string; current: number }[] };
  expect(week.metrics.find((m) => m.key === 'new_leads')!.current).toBeGreaterThanOrEqual(1);

  await page.goto('/estatisticas');
  await expect(page.getByRole('heading', { name: 'Este mês vs. o mês passado' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Comparação' }).getByText('Leads novos')).toBeVisible();
  await page.getByRole('button', { name: 'Semana' }).click();
  await expect(page.getByRole('heading', { name: 'Esta semana vs. a semana passada' })).toBeVisible();
});
