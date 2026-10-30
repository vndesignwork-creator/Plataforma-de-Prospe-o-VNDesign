import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Ficha de cliente mais limpa (cartões de prospeção recolhidos), filtros e ordem
 * na página Projetos, horas por tarefa e a pesquisa rápida (Ctrl+K).
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

/** "Site e presença online": um cartão de cada vez (Diagnóstico | Aparece nas IAs | Kit GEO). */
const SITE_TABS: Record<string, string> = { 'Diagnóstico do site': 'Diagnóstico', 'Aparece nas IAs?': 'Aparece nas IAs', 'Kit GEO': 'Kit GEO' };
async function showSiteCard(page: import('@playwright/test').Page, label: string) {
  if (SITE_TABS[label]) await page.getByRole('tablist', { name: 'Site e presença online' }).getByRole('tab', { name: SITE_TABS[label], exact: true }).click();
}

/** Ficha do cliente: as partes do projeto estão em separadores (Trabalho e entregas | Tempo e dinheiro | Cliente e equipa). */
async function projectTab(page: import('@playwright/test').Page, name: string) {
  await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

test('ficha de cliente: cartões de prospeção recolhidos; num lead por contactar, abertos', async ({ page }) => {
  test.setTimeout(90_000);
  const client = await createLead(page.request, { company_name: `Cliente Limpo ${run}`, status: 'cliente', services: ['landing_page'] });
  const prospect = await createLead(page.request, { company_name: `Por Contactar ${run}`, services: ['landing_page'] });
  const cards = ['Diagnóstico do site', 'Aparece nas IAs?', 'Kit GEO', 'Contactar'];

  await page.goto(`/leads/${client.id}`);
  await expect(page.locator('#projeto')).toBeVisible({ timeout: 60_000 });
  for (const label of cards) {
    await showSiteCard(page, label);
    await expect(page.getByRole('button', { name: `Expandir: ${label}` })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Análise automática do site' })).toHaveCount(0);

  await page.goto(`/leads/${prospect.id}`);
  for (const label of cards) {
    await showSiteCard(page, label);
    await expect(page.getByRole('button', { name: `Recolher: ${label}` })).toBeVisible();
  }

  // Abrir um cartão num cliente não muda os leads por contactar (memória à parte).
  await page.goto(`/leads/${client.id}`);
  await showSiteCard(page, 'Kit GEO');
  await page.getByRole('button', { name: 'Expandir: Kit GEO' }).click();
  await expect(page.getByRole('tab', { name: 'Perfil do Google' })).toBeVisible();
  await page.goto(`/leads/${prospect.id}`);
  await showSiteCard(page, 'Diagnóstico do site');
  await expect(page.getByRole('button', { name: 'Recolher: Diagnóstico do site' })).toBeVisible();
});

test('Projetos: filtros (atrasados, pagamentos em atraso, esta semana), ordem e recolher', async ({ page }) => {
  test.setTimeout(120_000);
  const late = await createLead(page.request, { company_name: `Projeto Atrasado ${run}`, status: 'cliente', estimated_value: 100 });
  const soon = await createLead(page.request, { company_name: `Projeto Semana ${run}`, status: 'cliente', estimated_value: 3000 });
  await page.request.patch(`/api/v1/leads/${late.id}/project`, { data: { due_on: iso(-2) } });
  await page.request.patch(`/api/v1/leads/${soon.id}/project`, { data: { due_on: iso(3) } });
  const pay = await page.request.post(`/api/v1/leads/${soon.id}/payments`, { data: { description: 'Sinal', amount: 300, due_on: iso(-5) } });
  expect(pay.status(), await pay.text()).toBe(201);

  await page.goto('/projetos');
  await page.getByRole('button', { name: 'Lista' }).click();
  const list = page.getByRole('list', { name: 'Projetos em curso' });
  const row = (name: string) => list.getByRole('listitem').filter({ hasText: name }).first();
  const filters = page.getByRole('group', { name: 'Filtrar projetos' });

  await filters.getByRole('button', { name: /^Atrasados/ }).click();
  await expect(row(`Projeto Atrasado ${run}`)).toBeVisible();
  await expect(row(`Projeto Semana ${run}`)).toHaveCount(0);
  await filters.getByRole('button', { name: /^Pagamentos em atraso/ }).click();
  await expect(row(`Projeto Semana ${run}`)).toBeVisible();
  await expect(row(`Projeto Atrasado ${run}`)).toHaveCount(0);
  await filters.getByRole('button', { name: /^Entregam esta semana/ }).click();
  await expect(row(`Projeto Semana ${run}`)).toBeVisible();
  await expect(row(`Projeto Atrasado ${run}`)).toHaveCount(0);
  await filters.getByRole('button', { name: /^Todos/ }).click();

  // Ordenar por valor: o de 300 € (pagamentos) antes do de 100 € (valor estimado).
  await page.getByLabel('Ordenar por').selectOption('valor');
  const names = await list.getByRole('listitem').filter({ hasText: run }).allTextContents();
  const ours = names.filter((n) => n.includes(`Projeto Semana ${run}`) || n.includes(`Projeto Atrasado ${run}`));
  expect(ours[0]).toContain(`Projeto Semana ${run}`);
  await page.getByLabel('Ordenar por').selectOption('prazo');

  // Recolher um projeto: fica só a linha do título (com o resumo curto).
  const r = row(`Projeto Semana ${run}`);
  await r.getByRole('button', { name: `Recolher: Projeto Semana ${run}` }).click();
  await expect(r.getByRole('group', { name: `Resumo de Projeto Semana ${run}` })).toHaveCount(0);
  await expect(r.getByText(/300\s€ em atraso/)).toBeVisible();
  await page.reload();
  await expect(row(`Projeto Semana ${run}`).getByRole('button', { name: `Expandir: Projeto Semana ${run}` })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir todos' }).click();
  await expect(row(`Projeto Semana ${run}`).getByRole('group', { name: `Resumo de Projeto Semana ${run}` })).toBeVisible();
});

test('horas por tarefa: registo à mão com tarefa, tempo na tarefa e "Tempo por tarefa"', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Horas Tarefa ${run}`, status: 'cliente' });
  const task = (await (await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Página inicial ${run}` } })).json()).data as { id: string };
  const other = await createLead(page.request, { company_name: `Outro Projeto ${run}`, status: 'cliente' });
  const foreign = (await (await page.request.post(`/api/v1/leads/${other.id}/tasks`, { data: { title: 'Doutro projeto' } })).json()).data as { id: string };

  // Tarefa de outro projeto: recusada.
  const bad = await page.request.post(`/api/v1/leads/${lead.id}/time`, { data: { date: iso(0), minutes: 30, task_id: foreign.id } });
  expect(bad.status()).toBe(422);
  const ok = await page.request.post(`/api/v1/leads/${lead.id}/time`, { data: { date: iso(0), minutes: 90, task_id: task.id } });
  expect(ok.status(), await ok.text()).toBe(201);
  expect((await ok.json()).data.task_id).toBe(task.id);
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; time_seconds?: number }[];
  expect(tasks.find((t) => t.id === task.id)?.time_seconds).toBe(90 * 60);

  await page.goto(`/leads/${lead.id}`);
  await expect(page.locator('#tarefas').getByRole('listitem').filter({ hasText: `Página inicial ${run}` })).toContainText('1 h 30 min');
  await projectTab(page, 'Tempo e dinheiro');
  const byTask = page.locator('#projeto').getByRole('list', { name: 'Tempo por tarefa' });
  await expect(byTask).toContainText(`Página inicial ${run}`);
  await expect(byTask).toContainText('1 h 30 min');

  // Registo à mão pela ficha, sem tarefa: aparece em "Sem tarefa".
  await page.locator('#projeto').getByRole('button', { name: 'À mão' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registar horas' });
  await dialog.getByLabel('Horas').fill('0');
  await dialog.getByLabel('Minutos').fill('20');
  await expect(dialog.getByLabel('Tarefa (opcional)')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Registar' }).click();
  await expect(byTask).toContainText('Sem tarefa');
});

test('pesquisa rápida (Ctrl+K): leads, tarefas e páginas', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Pesquisa Rápida ${run}`, status: 'cliente' });
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Montar galeria ${run}` } });
  expect((await page.request.get('/api/v1/tasks?q=a')).status()).toBe(400);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Pesquisar leads, projetos, tarefas e páginas' });
  await expect(box).toBeFocused();
  await box.fill(`Pesquisa Rápida ${run}`);
  await expect(page.getByRole('option', { name: new RegExp(`#${lead.number} Pesquisa Rápida ${run}`) })).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/leads/${lead.number}-`));

  // Tarefa: abre a ficha nas tarefas.
  await page.getByRole('button', { name: 'Pesquisar…' }).click();
  await box.fill(`galeria ${run}`);
  await page.getByRole('option', { name: new RegExp(`Montar galeria ${run}`) }).click();
  await expect(page).toHaveURL(/#tarefas$/);

  // Páginas: setas + Enter.
  await page.keyboard.press('Control+k');
  await box.fill('estatís');
  await expect(page.getByRole('option', { name: 'Estatísticas' })).toHaveAttribute('aria-selected', 'true');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/estatisticas$/);

  // Secções das Definições (também por outras palavras).
  await page.keyboard.press('Control+k');
  await box.fill('Setores');
  await page.getByRole('option', { name: 'Definições → Setores' }).click();
  await expect(page).toHaveURL(/\/definicoes\/setores$/);
  await page.keyboard.press('Control+k');
  await box.fill('palavra-passe');
  await expect(page.getByRole('option', { name: 'Definições → Conta' })).toBeVisible();

  // Estado, setor e serviço: a lista de leads filtrada.
  await box.fill('Respondeu');
  await page.getByRole('option', { name: 'Leads em “Respondeu”' }).click();
  await expect(page).toHaveURL(/\/leads\?status=respondeu$/);
  const sector = ((await (await page.request.get('/api/v1/sectors')).json()).data as { id: string; name: string }[])[0];
  if (sector) {
    await page.keyboard.press('Control+k');
    await box.fill(sector.name);
    await page.getByRole('option', { name: `Leads do setor “${sector.name}”` }).click();
    await expect(page).toHaveURL(new RegExp(`/leads\\?sector=${sector.id}$`));
  }
});
