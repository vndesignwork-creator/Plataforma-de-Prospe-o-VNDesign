import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';

const run = Date.now().toString(36);
const dir = 'test-results/fixtures';
// Próxima ação sempre no futuro (uma data já passada é trocada pelo follow-up automático).
const due = new Date(Date.now() + 30 * 86_400_000);
const dueText = `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}/${due.getFullYear()}`;

/** CSV com o formato da folha: título na linha 1, cabeçalho na linha 2, valores com emoji e "--". */
function sheetCsv(): string {
  const rows = [
    ['🎯  PIPELINE DE LEADS — PROSPEÇÃO DIGITAL VNDesign'],
    ['#', 'Empresa', 'Setor', 'Website', 'Cidade', 'Problemas', 'PageSpeed', 'Mobile?', 'Email', 'Telefone', 'Contacto', 'Estado', 'Canal', '1º Contacto', 'Último Follow-up', 'Próx. Ação', 'Valor Est. (€)'],
    ['', `Oficina Import ${run}, Lda`, '🔧 Serviços Técnicos', `https://oficina-${run}.pt/`, 'Amadora', 'Sem HTTPS', '34', '❌ Não', `geral@oficina-${run}.pt`, '--', '--', '📧 Contactado', '📧 Email', '01/10/2026', '--', `Ligar ${dueText}`, '1.250,00 €'],
    ['', `Restaurante Import ${run}`, '🍽️ Restauração', '--', 'Amadora', '', '--', '--', '--', '--', '--', '🔍 Identificado'],
    ['', `OFICINA IMPORT ${run}`, '🔧 Serviços Técnicos', `oficina-${run}.pt`, 'Amadora', 'Repetida', '', '', '', '', '', '🔍 Identificado'],
  ];
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
}

test('importar a folha (CSV): cabeçalho, duplicados no ficheiro e relatório', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/folha-${run}.csv`;
  writeFileSync(file, sheetCsv());

  await page.goto('/importar');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText('Cabeçalho detetado na linha 2.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Campo para a coluna Próx. Ação')).toHaveValue('next_action');
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();

  await expect(page.getByText('Repetido no ficheiro (linha 3)')).toBeVisible();
  await expect(page.getByText('2 a criar')).toBeVisible();
  await page.getByRole('button', { name: 'Importar 2 leads' }).click();

  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`Oficina Import ${run}`) })).toBeVisible();

  // A ficha tem os valores convertidos da folha.
  await page.getByRole('link', { name: new RegExp(`Oficina Import ${run}`) }).click();
  // Com o dia da semana: "Ligar · dom 29/11/2026".
  await expect(page.getByText(new RegExp(`Ligar · \\S+ ${dueText}`))).toBeVisible();
  await expect(page.getByText('1250,00 €')).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Origem: import')).toBeVisible();

  // Reimportar o mesmo ficheiro: tudo aparece como duplicado e pode ser juntado.
  await page.goto('/importar');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(page.getByText('Já existe:').first()).toBeVisible();
  await expect(page.getByText('0 a criar')).toBeVisible();
  await page.getByRole('button', { name: 'Juntar todos os duplicados' }).click();
  await page.getByRole('button', { name: /^Importar \d+ leads?$/ }).click();
  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible();
});

test('importar XLSX escolhe automaticamente a folha com os leads', async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('📊 Dashboard').addRows([['Resumo'], ['Total de Leads', 23]]);
  const ws = wb.addWorksheet('🎯 Pipeline de Leads');
  ws.addRows([
    ['🎯  PIPELINE DE LEADS'],
    ['#', 'Empresa', 'Setor', 'Cidade', 'Estado', 'Sugerido em'],
    [101, `Clínica XLSX ${run}`, '🏥 Saúde / Clínica', 'Lisboa', '💬 Respondeu', new Date(Date.UTC(2026, 9, 6))],
  ]);
  const file = `${dir}/folha-${run}.xlsx`;
  writeFileSync(file, Buffer.from(await wb.xlsx.writeBuffer()));

  await page.goto('/importar');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('combobox', { name: 'Folha' })).toHaveValue('🎯 Pipeline de Leads');
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  await page.getByRole('button', { name: 'Importar 1 lead' }).click();
  await page.getByRole('link', { name: new RegExp(`Clínica XLSX ${run}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Clínica XLSX ${run}` })).toBeVisible();
  await expect(page.getByLabel('Estado')).toHaveValue('respondeu');
  await expect(page.getByText('06/10/2026')).toBeVisible();
});

test('Kanban: mover com o teclado muda o estado e agenda o follow-up', async ({ page }) => {
  const name = `Kanban Teste ${run}`;
  const res = await page.request.post('/api/v1/leads', { data: { company_name: name, city: 'Amadora' } });
  expect(res.status()).toBe(201);

  await page.goto('/kanban');
  await page.getByLabel('Filtrar leads no Kanban').fill(name);
  const card = page.getByRole('button', { name: new RegExp(`${name}, Identificado`) });
  await expect(card).toBeVisible();
  // Espera que o filtro seja aplicado (só este cartão no quadro).
  await expect(page.getByRole('button', { name: /, Identificado$|, Contactado$|, Respondeu$/ })).toHaveCount(1);

  await card.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText(/sobre a coluna Identificado/)).toBeAttached();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(new RegExp(`sobre a coluna Contactado`))).toBeAttached();
  await page.keyboard.press('Space');

  await expect(page.getByText(/→ Contactado\. Follow-up agendado para \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByLabel('Leads em Contactado').getByText(name)).toBeVisible();
});

test('Dashboard: o essencial e "Hoje"; o resto em Estatísticas', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  // Por omissão, os números deste mês (com a comparação); "Sempre" mostra os totais.
  const period = page.getByRole('group', { name: 'Período dos números' });
  await expect(period.getByRole('button', { name: 'Este mês' })).toHaveAttribute('aria-pressed', 'true');
  for (const label of ['Leads novos', 'Contactados', 'Clientes ganhos', 'Valor do pipeline']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await period.getByRole('button', { name: 'Sempre' }).click();
  for (const label of ['Leads ativos', 'Clientes ganhos', 'Taxa de conversão', 'Valor do pipeline']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  // Pipeline com ligação à lista filtrada.
  await expect(page.getByRole('list', { name: 'Leads por estado' }).getByRole('link', { name: /Contactado/ })).toHaveAttribute(
    'href',
    '/leads?status=contactado&archived=include',
  );
  await expect(page.getByRole('heading', { name: 'Funil de todos os leads' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Estatísticas', exact: true }).last().click();
  await expect(page).toHaveURL(/\/estatisticas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Estatísticas' })).toBeVisible();
  for (const label of ['Total de leads', 'Valor total estimado']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Funil de todos os leads' })).toBeVisible();
  // Funil por período (pela linha do tempo): os leads novos e até onde chegaram.
  await expect(page.getByRole('heading', { name: 'Funil dos leads novos' })).toBeVisible();
  const cohort = page.getByRole('list', { name: 'Funil dos leads novos' });
  await expect(cohort.getByRole('listitem')).toHaveCount(6);
  await page.getByRole('radiogroup', { name: 'Período do funil' }).getByRole('radio', { name: '12 meses' }).click();
  await expect(cohort.getByRole('listitem').first()).toContainText(/\d+ leads novos/);
  await expect(page.getByRole('table', { name: 'Leads por estado' })).toBeAttached();
});

test('exportar leads para Excel', async ({ page }) => {
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Importar / Exportar leads' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Excel (.xlsx)' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^leads-vndesign-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('Kanban: arrastar com o rato para outra coluna', async ({ page }) => {
  const name = `Kanban Rato ${run}`;
  await page.request.post('/api/v1/leads', { data: { company_name: name } });
  await page.goto('/kanban');
  await page.getByLabel('Filtrar leads no Kanban').fill(name);
  const card = page.getByRole('button', { name: new RegExp(`^Mover .*${name}`) });
  await expect(card).toBeVisible();
  await expect(page.getByRole('button', { name: /, Identificado$/ })).toHaveCount(1);
  const from = (await card.boundingBox())!;
  const to = (await page.getByLabel('Leads em Respondeu').boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + 100, to.y + 40, { steps: 20 });
  await page.mouse.up();
  await expect(page.getByText(/→ Respondeu\./)).toBeVisible();
  await expect(page.getByLabel('Leads em Respondeu').getByText(name)).toBeVisible();
});

test('Kanban: mudar o estado pelo menu ⇄ e mostrar/esconder colunas pelo índice', async ({ page }) => {
  const name = `Kanban Menu ${run}`;
  await page.request.post('/api/v1/leads', { data: { company_name: name } });
  // Todas as colunas à vista (o índice guarda as escondidas na conta).
  await page.request.put('/api/v1/preferences/kanban.hidden', { data: { value: [] } });
  await page.goto('/kanban');
  await page.getByLabel('Filtrar leads no Kanban').fill(name);
  await expect(page.getByRole('button', { name: /, Identificado$/ })).toHaveCount(1);
  await page.getByRole('button', { name: new RegExp(`^Mudar estado de .*${name}$`) }).click();
  await page.getByRole('menuitem', { name: 'Reunião' }).click();
  await expect(page.getByText(/→ Reunião\./)).toBeVisible();
  await expect(page.getByLabel('Leads em Reunião').getByText(name)).toBeVisible();

  // No computador, o índice mostra/esconde colunas (fica guardado na conta).
  const nav = page.getByRole('navigation', { name: 'Colunas do Kanban' });
  const pausa = nav.getByRole('button', { name: /^Em pausa/ });
  await expect(pausa).toHaveAttribute('aria-pressed', 'true');
  await pausa.click();
  await expect(pausa).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Leads em Em pausa')).toHaveCount(0);
  await pausa.click();
  await expect(pausa).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Leads em Em pausa')).toBeVisible();
});

test('Dashboard: com pouco no "Hoje", os quentes acompanham a altura dele; Pipeline mostra a parte do total', async ({ page }) => {
  // Um "Hoje" quase vazio (só 1 lead na semana), com os quentes de verdade.
  await page.route('**/api/v1/dashboard/today', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    const d = json.data;
    d.upcoming = [...d.upcoming, ...d.overdue, ...d.due_today].slice(0, 1);
    Object.assign(d, { overdue: [], due_today: [], meetings: [], opened: [], stalled: [], tasks: { overdue: [], due_today: [], upcoming: [] } });
    await route.fulfill({ response: res, json });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');
  const hot = page.getByRole('list', { name: 'Leads mais quentes' });
  await expect(hot.locator('li').first()).toBeVisible();
  await expect(page.locator('#hoje').getByText('É tudo para os próximos 7 dias.')).toBeVisible();
  const sameHeight = async () => {
    const today = (await page.locator('#hoje').boundingBox())!.height;
    const card = (await hot.locator('xpath=..').boundingBox())!.height;
    return Math.abs(today - card) < 2;
  };
  await expect.poll(sameHeight).toBe(true);

  // Também com os cartões organizados à medida (outro caminho de montagem).
  const order = ['summary', 'today', 'hot', 'replies', 'pipeline', 'projects', 'reconnect'];
  await page.request.put('/api/v1/preferences/dashboard.cards', { data: { value: { order, hidden: [] } } });
  try {
    await page.reload();
    await expect(hot.locator('li').first()).toBeVisible();
    await expect.poll(sameHeight).toBe(true);
  } finally {
    await page.request.put('/api/v1/preferences/dashboard.cards', { data: { value: { order: [], hidden: [] } } });
  }
  await page.reload();

  // Pipeline: o número de cada fase e a parte do total (sem "avançaram", que contava os clientes em todas as fases).
  const pipeline = page.getByRole('list', { name: 'Leads por estado' });
  await expect(pipeline.getByText(/\d+ % do total/).first()).toBeVisible();
  await expect(pipeline.getByText(/avançaram/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Passagem entre fases →' })).toHaveAttribute('href', '/estatisticas#funil');
});
