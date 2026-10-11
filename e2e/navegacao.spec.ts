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

test('diagnóstico do site: recolhido quando o lead só tem serviços fora do Web Design', async ({ page }) => {
  const post = async (data: object) => (await (await page.request.post('/api/v1/leads', { data })).json()).data;
  const grafico = await post({ company_name: `Só gráfico ${run}`, services: ['identidade_visual'], approach_angle: `Ângulo ${run}` });
  const web = await post({ company_name: `Com site ${run}`, services: ['identidade_visual', 'landing_page'] });

  await page.goto(`/leads/${grafico.id}`);
  await expect(page.getByText('Não é relevante para os serviços escolhidos.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Análise automática do site' })).toHaveCount(0);
  // O ângulo de abordagem já não está dentro do diagnóstico: vê-se sempre.
  await expect(page.getByText(`Ângulo ${run}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar' }).click();
  await expect(page.getByRole('heading', { name: 'Análise automática do site' })).toBeVisible();
  await page.getByRole('button', { name: 'Esconder' }).click();
  await expect(page.getByRole('heading', { name: 'Análise automática do site' })).toHaveCount(0);

  await page.goto(`/leads/${web.id}`);
  await expect(page.getByRole('heading', { name: 'Análise automática do site' })).toBeVisible();
  await expect(page.getByText('Não é relevante para os serviços escolhidos.')).toHaveCount(0);
});

test('listas de escolha: menu da plataforma (não a lista do sistema) e o valor é gravado', async ({ page }) => {
  await page.goto('/leads/novo');
  await page.getByRole('textbox', { name: 'Empresa', exact: true }).fill(`Lista própria ${run}`);
  // O botão visível abre o nosso menu; a lista nativa fica escondida por baixo.
  const sector = page.getByLabel('Setor');
  await page.locator(`select#${await sector.getAttribute('id')} + button`).click();
  await page.getByRole('menuitemradio', { name: 'Restauração' }).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(0);
  await expect(sector.locator('option:checked')).toHaveText('Restauração');
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Lista própria ${run}` })).toBeVisible();
  await expect(page.getByText('Restauração').first()).toBeVisible();
});
