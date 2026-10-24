import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Tentativas na Prospeção (contagens e a 3.ª vez sem resposta), "Agora não"
 * volta sozinho, novo lead por texto (IA falsa) e dos contactos do telemóvel,
 * guardar contacto (vCard), cartões do Dashboard, clientes antigos e pesquisa
 * rápida nos comentários.
 */
const run = Date.now().toString(36);
let stop: () => void = () => {};
test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

function localEnv(name: string): string | undefined {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

/** Muda colunas diretamente na base de dados local (datas antigas que a API não deixa escrever). */
async function adminPatchLead(id: string, values: Record<string, unknown>) {
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL')!;
  const key = localEnv('SUPABASE_SECRET_KEY')!;
  const admin = await playwrightRequest.newContext();
  const res = await admin.patch(`${url}/rest/v1/leads?id=eq.${id}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    data: values,
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  await admin.dispose();
}

type LeadRow = { id: string; number: number; company_name: string; status: string; lost_reason: string | null; retry_on: string | null; next_action_on: string | null };
async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as LeadRow;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data as LeadRow;
const lisbonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

test('Prospeção: contagem de "Não atendeu" e "Contactado"; à 3.ª vez sem resposta sugere Sem interesse', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Tentativas ${run}`, status: 'contactado' });
  for (const outcome of ['contacted', 'no_answer', 'no_answer']) {
    const res = await page.request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome } });
    expect(res.status(), await res.text()).toBe(200);
  }
  // Primeiro da fila dos follow-ups (a data mais antiga).
  expect((await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { next_action_on: '2019-01-01' } })).status()).toBe(200);
  const queue = (await (await page.request.get('/api/v1/prospecting?filter=follow_up')).json()).data as { items: { lead: { id: string }; attempts?: unknown }[] };
  expect(queue.items.find((i) => i.lead.id === lead.id)?.attempts).toEqual({ no_answer: 2, contacted: 1, no_answer_streak: 2 });

  await page.goto('/prospecao');
  await page.getByRole('tab', { name: 'Follow-ups' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Tentativas ${run}`) })).toBeVisible();
  await expect(page.getByRole('button', { name: /Não atendeu/ })).toContainText('2×');
  await expect(page.getByRole('button', { name: /^Contactado/ })).toContainText('1×');

  await page.getByRole('button', { name: /Não atendeu/ }).click();
  const dialog = page.getByRole('dialog', { name: '3.ª vez sem resposta' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Passar a Sem interesse' }).click();
  await expect(page.getByText(new RegExp(`#${lead.number} Tentativas ${run}: registado`))).toBeVisible();
  expect(await getLead(page.request, lead.id)).toMatchObject({ status: 'sem_interesse', lost_reason: 'nao_responde' });
});

test('"Agora não" volta sozinho à Prospeção na data escolhida', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Agora Não ${run}`, status: 'contactado' });
  await page.goto(`/leads/${lead.id}`);
  await page.getByLabel('Estado', { exact: true }).selectOption('sem_interesse');
  const dialog = page.getByRole('dialog', { name: 'Porque fica “Sem interesse”?' });
  await dialog.getByLabel('Agora não (talvez mais tarde)').check();
  await expect(dialog.getByLabel('Voltar a tentar')).toHaveValue('3');
  await expect(dialog.getByText(/Volta à Prospeção a \d{2}\/\d{2}\/\d{4}\./)).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(async () => (await getLead(page.request, lead.id)).retry_on).not.toBeNull();
  const saved = await getLead(page.request, lead.id);
  expect(saved).toMatchObject({ status: 'sem_interesse', lost_reason: 'agora_nao' });
  expect(saved.retry_on! > lisbonToday()).toBe(true);
  await expect(page.getByText(/Volta à Prospeção a \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  // A data chega: o cron diário passa-o a Contactado, com a próxima ação para hoje.
  test.skip(!process.env.CRON_SECRET, 'Sem CRON_SECRET em apps/web/.env.local');
  await adminPatchLead(lead.id, { retry_on: '2020-01-01' });
  const cron = await page.request.get('/api/v1/cron/daily-digest', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status(), await cron.text()).toBe(200);
  expect((await cron.json()).retried).toBeGreaterThanOrEqual(1);
  expect(await getLead(page.request, lead.id)).toMatchObject({ status: 'contactado', retry_on: null, lost_reason: null, next_action_on: lisbonToday() });
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { body: string | null }[];
  expect(activities.some((a) => /^Voltou à prospeção: a \d{2}\/\d{2}\/\d{4} tinha dito “agora não”\.$/.test(a.body ?? ''))).toBe(true);
});

test('Novo lead: ditar ou escrever (a IA preenche) e escolher dos contactos', async ({ page }) => {
  // Contactos do telemóvel simulados (Android/Chrome).
  await page.addInitScript(() => {
    (window as unknown as { ContactsManager: unknown }).ContactsManager = function () {};
    Object.defineProperty(navigator, 'contacts', {
      value: { select: async () => [{ name: ['Rui Contacto'], tel: ['+351 933 111 222'], email: ['Rui@Exemplo.pt'] }] },
    });
  });
  await page.goto('/leads/novo');
  await page.getByRole('button', { name: 'Ditar ou escrever' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ditar ou escrever o lead' });
  await dialog.getByLabel('O que sabes do lead').fill('Restaurante O Quintal em Braga, falei com a Ana, 912 345 678, querem site com reservas.');
  await dialog.getByRole('button', { name: 'Preencher' }).click();
  await expect(page.getByText('Formulário preenchido: revê os dados antes de criar o lead.')).toBeVisible();
  await expect(page.getByLabel('Empresa', { exact: false }).first()).toHaveValue('Restaurante O Quintal');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('ana@oquintal.pt');

  // Dos contactos: só preenche o que está vazio.
  await page.goto('/leads/novo');
  await page.getByRole('button', { name: 'Escolher dos contactos' }).click();
  await expect(page.getByText('Contacto escolhido: falta o nome da empresa.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('rui@exemplo.pt');
});

test('Guardar contacto no telemóvel (vCard)', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `vCard ${run}`, contact_name: 'Ana Ribeiro', phone: '912 345 678', email: 'ana@exemplo.pt' });
  await page.goto(`/leads/${lead.id}`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Guardar contacto' }).click()]);
  expect(download.suggestedFilename()).toBe(`vCard-${run}.vcf`);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain(`FN:Ana Ribeiro (vCard ${run})`);
  expect(text).toContain('TEL;TYPE=WORK,VOICE:912345678');
});

test('Dashboard: organizar os cartões e clientes antigos (email ou "Já falei")', async ({ page }) => {
  expect((await page.request.put('/api/v1/preferences/dashboard.cards', { data: { value: { order: [], hidden: [] } } })).status()).toBeLessThan(300);
  // Cliente com o projeto concluído há 8 meses.
  const client = await createLead(page.request, { company_name: `Antigo ${run}`, status: 'cliente', contact_name: 'Rita Sousa' });
  expect((await page.request.post(`/api/v1/leads/${client.id}/project`, { data: { completed: true } })).status()).toBe(200);
  const old = new Date(Date.now() - 240 * 86_400_000).toISOString();
  await adminPatchLead(client.id, { project_completed_at: old });

  await page.goto('/dashboard');
  const reconnect = page.getByRole('list', { name: 'Clientes antigos para voltar a contactar' });
  await expect(reconnect.getByText(`Antigo ${run}`)).toBeVisible();
  await expect(reconnect.getByText(/há 7 meses|há 8 meses/)).toBeVisible();
  const row = reconnect.getByRole('listitem').filter({ hasText: `Antigo ${run}` });
  await row.getByRole('button', { name: 'Já falei' }).click();
  await expect(page.getByText(new RegExp(`#${client.number} Antigo ${run}: registado`))).toBeVisible();
  await expect(reconnect.getByText(`Antigo ${run}`)).toHaveCount(0);

  // Organizar: esconder "Leads mais quentes" e repor.
  await page.getByRole('button', { name: 'Organizar cartões' }).click();
  const dialog = page.getByRole('dialog', { name: 'Organizar cartões' });
  await expect(dialog.getByLabel('Mostrar Hoje')).toBeDisabled();
  await dialog.getByLabel('Mostrar Leads mais quentes').uncheck();
  await dialog.getByRole('button', { name: 'Subir Pipeline' }).click();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Cartões organizados.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leads mais quentes' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hoje' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Organizar cartões' }).click();
  await page.getByRole('dialog', { name: 'Organizar cartões' }).getByRole('button', { name: 'Repor original' }).click();
  await expect(page.getByRole('heading', { name: 'Leads mais quentes' })).toBeVisible();
});

test('Pesquisa rápida (Ctrl+K) encontra os comentários da equipa', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Comentário ${run}` });
  const res = await page.request.post(`/api/v1/leads/${lead.id}/comments`, { data: { body: `Orçamento combinado zx${run}` } });
  expect(res.status(), await res.text()).toBe(201);
  await page.goto('/dashboard');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(`zx${run}`);
  const option = page.getByRole('option', { name: new RegExp(`zx${run}`) });
  await expect(option).toContainText('Comentário da equipa');
  await option.click();
  await expect(page).toHaveURL(/#atividade$/);
});
