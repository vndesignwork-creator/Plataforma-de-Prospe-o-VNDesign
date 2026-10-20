import { expect, test } from '@playwright/test';
import { startStubs } from './stubs';

/* Gerador de leads com o Claude (servidor falso em e2e/stubs.ts: sem rede nem custos). */
const run = Date.now().toString(36);
let stop: () => void;

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop?.());

async function waitForRun(page: import('@playwright/test').Page, id: string) {
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/lead-generation/${id}`)).json()).data.status, { timeout: 30_000 })
    .not.toBe('running');
}

test('pesquisar com IA, rever a lista e adicionar os leads escolhidos', async ({ page }) => {
  const dup = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Duplicado ${run}` } })).json()).data;

  await page.goto('/gerar-leads');
  await expect(page.getByRole('heading', { level: 1, name: 'Gerar leads' })).toBeVisible();
  await page.getByLabel('O que procuras?').fill(`cafés e oficinas ${run}`);
  await page.getByRole('button', { name: 'Procurar com IA' }).click();
  await expect(page.getByText('A pesquisar na internet')).toBeVisible();

  const list = page.getByRole('list', { name: 'Empresas encontradas' });
  await expect(list).toBeVisible({ timeout: 30_000 });
  // A empresa sem fonte foi descartada; o duplicado fica assinalado e não se escolhe.
  const items = list.locator(':scope > li');
  await expect(items).toHaveCount(3);
  const cafe = items.filter({ hasText: `Café Central ${run}` });
  const oficina = items.filter({ hasText: `Oficina Rápida ${run}` });
  const duplicado = items.filter({ hasText: `Duplicado ${run}` });
  // "Novo", ou "Parecido com #N" se testes anteriores deixaram um nome quase igual.
  await expect(cafe.getByText(/^(Novo|Parecido com #\d+)$/)).toBeVisible();
  await expect(cafe.getByText('Sem site próprio', { exact: true })).toBeVisible();
  await expect(duplicado.getByRole('link', { name: `Já existe · #${dup.number}` })).toBeVisible();
  await expect(duplicado.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByText(/6 pesquisa\(s\) · custo estimado/)).toBeVisible();

  await cafe.getByRole('checkbox').check();
  await oficina.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Adicionar 2 leads' }).click();
  await expect(page.getByText('2 leads criados.')).toBeVisible();
  await expect(cafe.getByRole('link', { name: 'Adicionado' })).toBeVisible();
  await expect(oficina.getByRole('link', { name: 'Adicionado' })).toBeVisible();

  const leads = (await (await page.request.get('/api/v1/leads', { params: { q: `Café Central ${run}` } })).json()).data;
  expect(leads).toHaveLength(1);
  expect(leads[0].website).toBe(`https://www.facebook.com/cafecentral${run}`);
  expect(leads[0].phone).toBe('214 000 001');
  expect(leads[0].services).toEqual(['site_institucional']);
  expect(leads[0].notes).toContain('Encontrado pelo gerador de leads');
  expect(leads[0].approach_angle).toBe('Propor um site simples com a carta e o horário.');

  const oficinaLead = (await (await page.request.get('/api/v1/leads', { params: { q: `Oficina Rápida ${run}` } })).json()).data[0];
  // Serviço que não existe no catálogo é ignorado; o email é do domínio da empresa.
  expect(oficinaLead.services).toEqual(['site_institucional']);
  expect(oficinaLead.email).toBe(`geral@oficina-${run}.invalid`);
});

test('API: uma pesquisa de cada vez e adicionar duas vezes não duplica', async ({ page }) => {
  const started = await page.request.post('/api/v1/lead-generation', { data: { query: `padarias api${run}`, city: 'Sintra' } });
  expect(started.status()).toBe(202);
  const id = (await started.json()).data.id as string;
  const again = await page.request.post('/api/v1/lead-generation', { data: { query: `outra api${run}` } });
  expect(again.status()).toBe(409);

  await waitForRun(page, id);
  const result = (await (await page.request.post(`/api/v1/lead-generation/${id}/add`, { data: { indexes: [0], audit: false } })).json()).data;
  expect(result.created).toHaveLength(1);
  const repeat = (await (await page.request.post(`/api/v1/lead-generation/${id}/add`, { data: { indexes: [0], audit: false } })).json()).data;
  expect(repeat.created).toHaveLength(0);
  expect(repeat.skipped[0].reason).toBe('Já foi adicionada.');

  const bad = await page.request.post('/api/v1/lead-generation', { data: { query: 'x' } });
  expect(bad.status()).toBe(400);
});
