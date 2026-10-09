import { expect, test } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Fase E. O servidor tem de usar os serviços falsos de e2e/stubs.ts:
 *   ANTHROPIC_API_KEY=sk-ant-teste  AI_BASE_URL=http://127.0.0.1:4621
 *   GEOCODER_URL=http://127.0.0.1:4620/search
 */
const run = Date.now().toString(36);
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

test('proposta: pacote recomendado + manutenção, desconto, PDF e marcar como enviada', async ({ page }) => {
  const name = `Restaurante Proposta ${run}`;
  const res = await page.request.post('/api/v1/leads', { data: { company_name: name, city: 'Amadora', contact_name: 'Sr. Manuel', status: 'reuniao' } });
  const lead = (await res.json()).data;

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('link', { name: 'Nova proposta' }).click();
  await expect(page.getByRole('heading', { name: 'Nova proposta' })).toBeVisible();

  const items = page.getByRole('list', { name: 'Itens da proposta' });
  await expect(items.getByLabel('Nome').first()).toHaveValue('Profissional');
  await page.getByRole('group', { name: 'Acrescentar pacote' }).getByRole('button', { name: /Manutenção mensal/ }).click();
  await expect(items.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Desconto (€)').fill('50');
  await expect(page.getByTestId('proposal-total')).toHaveText('900,00 €');
  await expect(page.getByText('45,00 €/mês')).toBeVisible();

  await page.getByRole('button', { name: 'Criar proposta' }).click();
  await expect(page.getByText(/Proposta \d{4}-\d{3} criada\./)).toBeVisible();
  await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]{36}$/);
  const proposalId = page.url().split('/').pop()!;

  const pdf = await page.request.get(`/api/v1/proposals/${proposalId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByRole('button', { name: 'Marcar como enviada' }).click();
  await expect(page.getByText('Marcada como enviada. O lead passou a "Proposta enviada".')).toBeVisible();

  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByLabel('Estado', { exact: true })).toHaveValue('proposta_enviada');
  const card = page.getByRole('list', { name: 'Propostas do lead' });
  await expect(card.getByText('Enviada')).toBeVisible();
  await expect(card.getByText('900,00 €')).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Proposta gerada').first()).toBeVisible();
});

test('email com IA: gera, junta assinatura e opt-out e guarda no lead', async ({ page }) => {
  const settings = await (await page.request.get('/api/v1/settings')).json();
  test.skip(!settings.data.ai_configured, 'ANTHROPIC_API_KEY não definida no servidor de testes');

  const name = `Clinica IA ${run}`;
  const res = await page.request.post('/api/v1/leads', { data: { company_name: name, city: 'Amadora', website: `https://ia-${run}.pt` } });
  const lead = (await res.json()).data;

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Gerar email' }).click();
  await expect(page.getByText('Email gerado. Revê e ajusta antes de enviar.')).toBeVisible();
  const subject = page.getByLabel('Assunto', { exact: true }).last();
  await expect(subject).toHaveValue(`Uma ideia rápida para o site da ${name}`);
  const body = page.getByLabel('Mensagem').last();
  await expect(body).toHaveValue(/não usa HTTPS[\s\S]*Cumprimentos,\n\n[\s\S]+\n\nSe não quiser receber mais contactos/);

  await page.getByRole('button', { name: 'Guardar como email de prospeção' }).last().click();
  await expect(page.getByText('Guardado como email de prospeção do lead.')).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Email gerado com IA')).toBeVisible();
});

test('mapa: localizar leads pela morada e abrir um lead no mapa', async ({ page }) => {
  const name = `Oficina Mapa ${run}`;
  const res = await page.request.post('/api/v1/leads', { data: { company_name: name, address: 'Rua do Teste 1', city: 'Amadora' } });
  const lead = (await res.json()).data;

  await page.goto('/mapa');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.getByRole('button', { name: /^Localizar \d+ leads$/ }).click();
  await expect(page.getByText(/\d+ localizados/)).toBeVisible({ timeout: 30_000 });

  await page.getByText(/Lista dos leads no mapa/).click();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  await expect(page.locator('path.leaflet-interactive').first()).toBeVisible();

  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByText('Morada encontrada')).toBeVisible();
  await page.getByRole('link', { name: 'Ver no mapa' }).click();
  await expect(page).toHaveURL(new RegExp(`/mapa\\?lead=${lead.id}`));
  await expect(page.getByRole('link', { name: new RegExp(`#${lead.number} ${name}`) }).first()).toBeVisible();
});

test('definições: pacotes de serviços e textos das propostas', async ({ page }) => {
  await page.goto('/definicoes#propostas');
  const card = page.locator('#propostas');
  await expect(card.getByRole('list', { name: 'Pacotes' }).getByText('Profissional')).toBeVisible();

  await card.getByRole('button', { name: 'Novo pacote' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo pacote' });
  await dialog.getByLabel('Nome').fill(`Loja online ${run}`);
  await dialog.getByLabel('Preço (€)').fill('2.400');
  await dialog.getByLabel('O que inclui (uma linha por ponto)').fill('Até 100 produtos\nPagamentos MB Way');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Pacote criado.')).toBeVisible();
  await expect(card.getByText(`Loja online ${run}`)).toBeVisible();
  await expect(card.getByText('2400,00 €').or(card.getByText('2 400,00 €')).or(card.getByText('2.400,00 €')).first()).toBeVisible();

  await card.getByRole('button', { name: `Apagar Loja online ${run}` }).click();
  await expect(page.getByText(`Pacote "Loja online ${run}" apagado.`)).toBeVisible();
});
