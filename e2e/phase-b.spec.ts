import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';

const run = Date.now().toString(36);
const dir = 'test-results/fixtures';

/** CSV com o formato da folha: título na linha 1, cabeçalho na linha 2, valores com emoji e "--". */
function sheetCsv(): string {
  const rows = [
    ['🎯  PIPELINE DE LEADS — PROSPEÇÃO DIGITAL VNDesign'],
    ['#', 'Empresa', 'Setor', 'Website', 'Cidade', 'Problemas', 'PageSpeed', 'Mobile?', 'Email', 'Telefone', 'Contacto', 'Estado', 'Canal', '1º Contacto', 'Último Follow-up', 'Próx. Ação', 'Valor Est. (€)'],
    ['', `Oficina Import ${run}, Lda`, '🔧 Serviços Técnicos', `https://oficina-${run}.pt/`, 'Amadora', 'Sem HTTPS', '34', '❌ Não', `geral@oficina-${run}.pt`, '--', '--', '📧 Contactado', '📧 Email', '01/10/2026', '--', 'Ligar 12/10/2026', '1.250,00 €'],
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
  await expect(page.getByText('Ligar · 12/10/2026')).toBeVisible();
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

test('Dashboard mostra o resumo, o funil e a lista "Hoje"', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  for (const label of ['Total de leads', 'Leads ativos', 'Clientes ganhos', 'Taxa de conversão', 'Valor do pipeline']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Funil de conversão' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Leads por estado' })).toBeAttached();
});

test('exportar leads para Excel', async ({ page }) => {
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Exportar leads' }).click();
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

test('Kanban: mudar o estado pelo menu ⇄ e saltar de coluna pelo índice', async ({ page }) => {
  const name = `Kanban Menu ${run}`;
  await page.request.post('/api/v1/leads', { data: { company_name: name } });
  await page.goto('/kanban');
  await page.getByLabel('Filtrar leads no Kanban').fill(name);
  await expect(page.getByRole('button', { name: /, Identificado$/ })).toHaveCount(1);
  await page.getByRole('button', { name: new RegExp(`^Mudar estado de .*${name}$`) }).click();
  await page.getByRole('menuitem', { name: 'Reunião' }).click();
  await expect(page.getByText(/→ Reunião\./)).toBeVisible();
  await expect(page.getByLabel('Leads em Reunião').getByText(name)).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Colunas do Kanban' });
  await nav.getByRole('button', { name: /^Em pausa/ }).click();
  await expect(nav.getByRole('button', { name: /^Em pausa/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('Leads em Em pausa')).toBeInViewport();
});
