import { expect, test, type Page } from '@playwright/test';
import { startStubs } from './stubs';

/* Definições → Inteligência artificial: chaves de vários fornecedores (servidor falso em e2e/stubs.ts). */
const run = Date.now().toString(36);
let stop: () => void;
const created: string[] = [];

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(async ({ browser }) => {
  // Volta tudo à chave do servidor (os outros testes usam-na).
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.request.patch('/api/v1/settings', {
    data: { ai: { email: { provider: 'server', model: null }, lead_generation: { provider: 'server', model: null } } },
  });
  for (const id of created) await page.request.delete(`/api/v1/ai-providers/${id}`);
  await page.close();
  stop?.();
});

async function addProvider(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/v1/ai-providers', { data });
  expect(res.status()).toBe(201);
  const provider = (await res.json()).data;
  created.push(provider.id);
  return provider as { id: string; label: string; key_hint: string; web_search: boolean };
}

async function waitForRun(page: Page, id: string) {
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/lead-generation/${id}`)).json()).data.status, { timeout: 30_000 })
    .not.toBe('running');
  return (await (await page.request.get(`/api/v1/lead-generation/${id}`)).json()).data;
}

test('juntar uma chave da OpenAI nas Definições, testar e escolher para o email com IA', async ({ page }) => {
  await page.goto('/definicoes/ia');
  await page.getByRole('button', { name: 'Juntar chave' }).click();
  const dialog = page.getByRole('dialog', { name: 'Juntar chave de IA' });
  await dialog.getByLabel('Nome (opcional)').fill(`OpenAI ${run}`);
  await dialog.getByLabel('Chave da API').fill('sk-teste-openai-1234567890');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Chave guardada.')).toBeVisible();

  const list = page.getByRole('list', { name: 'Fornecedores de IA' });
  const row = list.getByRole('listitem').filter({ hasText: `OpenAI ${run}` });
  await expect(row.getByText('chave …7890')).toBeVisible();
  await expect(row.getByText('Pesquisa na internet')).toBeVisible();
  const providers = (await (await page.request.get('/api/v1/ai-providers')).json()).data as { id: string; label: string }[];
  const openai = providers.find((p) => p.label === `OpenAI ${run}`)!;
  created.push(openai.id);
  // A chave nunca volta na API.
  expect(JSON.stringify(providers)).not.toContain('sk-teste-openai');

  await row.getByRole('button', { name: 'Testar' }).click();
  await expect(row.getByText('Chave válida · 2 modelos disponíveis.')).toBeVisible();

  // Email com IA: OpenAI · gpt-teste.
  const email = page.getByRole('region', { name: 'Email com IA' });
  await email.getByLabel('Fornecedor').selectOption({ label: `OpenAI ${run}` });
  await email.getByLabel('Modelo').fill('gpt-teste');
  await email.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(`Email com IA: OpenAI ${run} guardado.`)).toBeVisible();

  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Padaria IA ${run}` } })).json()).data;
  const res = await page.request.post(`/api/v1/leads/${lead.id}/ai-email`, { data: { kind: 'primeiro_contacto' } });
  expect(res.status()).toBe(200);
  const draft = (await res.json()).data;
  expect(draft.model).toBe('gpt-teste');
  expect(draft.body).toContain(`Escrito por gpt-teste para a Padaria IA ${run}`);
});

test('chave recusada, modelo sem saída estruturada e fornecedor sem pesquisa na internet', async ({ page }) => {
  const bad = await addProvider(page, { kind: 'openai', label: `Inválida ${run}`, api_key: 'sk-invalida-0000000000' });
  const tested = (await (await page.request.post(`/api/v1/ai-providers/${bad.id}/test`)).json()).data;
  expect(tested.ok).toBe(false);

  // "Outro" compatível: o modelo recusa json_schema e a resposta vem pela alternativa.
  const custom = await addProvider(page, { kind: 'custom', label: `Groq ${run}`, api_key: 'gsk-teste-1234567890', base_url: 'http://127.0.0.1:4621/v1/' });
  expect(custom.web_search).toBe(false);
  await page.request.patch('/api/v1/settings', { data: { ai: { email: { provider: custom.id, model: 'sem-schema' } } } });
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Talho IA ${run}` } })).json()).data;
  const draft = (await (await page.request.post(`/api/v1/leads/${lead.id}/ai-email`, { data: { kind: 'primeiro_contacto' } })).json()).data;
  expect(draft.body).toContain('Escrito por sem-schema');

  // O gerador de leads precisa de pesquisa na internet.
  await page.request.patch('/api/v1/settings', { data: { ai: { lead_generation: { provider: custom.id, model: 'qualquer' } } } });
  const refused = await page.request.post('/api/v1/lead-generation', { data: { query: `cafés ${run}` } });
  expect(refused.status()).toBe(422);
  expect((await refused.json()).title).toBe('Este fornecedor não pesquisa na internet');

  // Fornecedor que não existe: recusado nas definições.
  const unknown = await page.request.patch('/api/v1/settings', {
    data: { ai: { email: { provider: '00000000-0000-4000-8000-000000000000', model: null } } },
  });
  expect(unknown.status()).toBe(422);
});

test('gerador de leads com OpenAI e com OpenRouter', async ({ page }) => {
  const openai = await addProvider(page, { kind: 'openai', label: `OpenAI gerador ${run}`, api_key: 'sk-teste-openai-1234567890' });
  await page.request.patch('/api/v1/settings', { data: { ai: { lead_generation: { provider: openai.id, model: 'gpt-teste' } } } });
  let started = await page.request.post('/api/v1/lead-generation', { data: { query: `oficinas oai${run}` } });
  expect(started.status()).toBe(202);
  let done = await waitForRun(page, (await started.json()).data.id);
  expect(done.status).toBe('done');
  expect(done.model).toBe(`OpenAI gerador ${run} · gpt-teste`);
  expect(done.searches).toBe(2);
  expect(done.cost_usd).toBeNull();
  expect(done.candidates.map((c: { company_name: string }) => c.company_name)).toContain(`Café Central oai${run}`);

  const openrouter = await addProvider(page, { kind: 'openrouter', label: `OpenRouter ${run}`, api_key: 'sk-or-teste-1234567890' });
  await page.request.patch('/api/v1/settings', { data: { ai: { lead_generation: { provider: openrouter.id, model: 'openai/gpt-teste' } } } });
  started = await page.request.post('/api/v1/lead-generation', { data: { query: `cafés or${run}` } });
  done = await waitForRun(page, (await started.json()).data.id);
  expect(done.status).toBe('done');
  expect(done.candidates).toHaveLength(3);

  // Apagar o fornecedor em uso: o gerador volta à chave do servidor.
  await page.request.delete(`/api/v1/ai-providers/${openrouter.id}`);
  const settings = (await (await page.request.get('/api/v1/settings')).json()).data;
  expect(settings.ai.lead_generation).toEqual({ provider: 'server', model: null });
});
