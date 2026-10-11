import { expect, test } from '@playwright/test';

/* Caminho por cima do título ("← Leads › #13 O Quintal") e o botão Voltar. */
const run = Date.now().toString(36);

test('caminho na proposta e Voltar mantém os filtros da lista', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Caminho ${run}`, city: `Vila ${run}` } })).json()).data;

  // Lista filtrada → ficha → Voltar: os filtros continuam.
  await page.goto(`/leads?city=${encodeURIComponent(`Vila ${run}`)}`);
  await page.getByRole('link', { name: `Caminho ${run}` }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: `Caminho ${run}` })).toBeVisible();
  const crumbs = page.getByRole('navigation', { name: 'Caminho' });
  await crumbs.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/leads\?city=/);

  // Proposta nova: Leads › #N Empresa, e Voltar leva à ficha.
  await page.goto(`/leads/${lead.id}/propostas/nova`);
  await expect(crumbs.getByRole('link', { name: 'Leads' })).toHaveAttribute('href', '/leads');
  await expect(crumbs.getByRole('link', { name: `#${lead.number} Caminho ${run}` })).toBeVisible();
  await crumbs.getByRole('link', { name: 'Voltar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Caminho ${run}` })).toBeVisible();
});

test('linha do tempo: apagar uma chamada registada (com confirmação); o histórico automático fica', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Registos ${run}` } })).json()).data;
  await page.request.post(`/api/v1/leads/${lead.id}/activities`, { data: { type: 'call_logged', body: `Chamada a apagar ${run}` } });
  await page.goto(`/leads/${lead.id}`);
  const timeline = page.getByRole('list', { name: 'Atividade do lead' });
  const call = timeline.getByRole('listitem').filter({ hasText: `Chamada a apagar ${run}` });
  await call.getByRole('button', { name: 'Apagar registo' }).click();
  await call.getByRole('button', { name: 'Sim' }).click();
  await expect(page.getByText('Registo apagado.')).toBeVisible();
  await expect(timeline.getByText(`Chamada a apagar ${run}`)).toHaveCount(0);
  // "Lead criado" é automático: não tem botão de apagar.
  await expect(timeline.getByRole('listitem').filter({ hasText: 'Lead criado' }).getByRole('button', { name: 'Apagar registo' })).toHaveCount(0);
});
