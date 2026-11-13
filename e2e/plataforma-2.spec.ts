import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';

/*
 * Erros do ecrã no Estado da plataforma, Registo de alterações, Contactos a corrigir,
 * Dashboard num só pedido e Repor a partir de uma cópia.
 */
const run = Date.now().toString(36);

test('Erros do ecrã ficam no Estado da plataforma (os iguais juntam-se)', async ({ page }) => {
  const report = () => page.request.post('/api/v1/platform/client-error', { data: { message: `Falhou o cartão ${run}`, page: '/leads/123-padaria' } });
  expect((await report()).status()).toBe(204);
  expect((await report()).status()).toBe(204);
  const status = (await (await page.request.get('/api/v1/platform/status')).json()).data as { problems: { title: string; detail: string; count: number; area: string }[] };
  expect(status.problems.find((p) => p.detail === `Falhou o cartão ${run}`)).toMatchObject({ area: 'screen', count: 2, title: 'Uma página falhou no ecrã (/leads/:n)' });
});

test('Registo de alterações: chaves da API, exportação e definições', async ({ page }) => {
  const token = (await (await page.request.post('/api/v1/tokens', { data: { name: `Registo ${run}`, scopes: ['leads:import'] } })).json()).data as { id: string };
  expect((await page.request.delete(`/api/v1/tokens/${token.id}`)).status()).toBeLessThan(300);
  expect((await page.request.get('/api/v1/leads/export?format=csv&q=nada-de-nada')).status()).toBe(200);
  await page.goto('/definicoes/registo');
  await expect(page.getByText(`Criou a chave da API “Registo ${run}”`)).toBeVisible();
  await expect(page.getByText('Revogou uma chave da API').first()).toBeVisible();
  await expect(page.getByText('Exportou leads (CSV)').first()).toBeVisible();
});

test('Contactos a corrigir: telefone com dígitos a menos e o mesmo telefone em dois leads', async ({ page }) => {
  const a = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Curto ${run}`, phone: '91234567' } })).json()).data as { id: string; number: number };
  const shared = `96${String(Date.now()).slice(-7)}`;
  const b = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Partilha A ${run}`, phone: shared } })).json()).data as { id: string; number: number };
  const c = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Partilha B ${run}`, phone: `+351 ${shared}` } })).json()).data as { id: string; number: number };
  try {
    await page.goto('/leads/contactos');
    const list = page.getByRole('list', { name: 'Leads com contactos a corrigir' });
    const row = (n: number) => list.locator(`li[data-lead="${n}"]`);
    const curto = row(a.number);
    await expect(curto).toContainText('91234567: tem 8 dígitos (um número português tem 9).');
    const partilha = row(b.number);
    await expect(partilha).toContainText(`O mesmo telefone que #${c.number} Partilha B ${run}`);
    // Só os telefones / só os emails.
    await page.getByRole('button', { name: /^Emails/ }).click();
    await expect(list.getByText(`Curto ${run}`)).toHaveCount(0);
  } finally {
    for (const l of [a, b, c]) await page.request.delete(`/api/v1/leads/${l.id}`);
  }
});

test('Dashboard: os cartões vêm num só pedido', async ({ page }) => {
  const bundle = (await (await page.request.get('/api/v1/dashboard/bundle')).json()).data as Record<string, unknown>;
  for (const key of ['dashboard', 'today', 'period', 'goals', 'replies', 'preferences']) expect(bundle).toHaveProperty(key);
  const asked: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/v1/')) asked.push(path);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(asked).toContain('/api/v1/dashboard/bundle');
  // Os pedidos que o pedido único substitui não se fazem um a um.
  for (const path of ['/api/v1/dashboard', '/api/v1/dashboard/today', '/api/v1/goals', '/api/v1/replies', '/api/v1/dashboard/period']) {
    expect(asked, path).not.toContain(path);
  }
});

test('Repor a partir de uma cópia: só o lead que falta (com o mesmo número) e as suas tarefas', async ({ page }) => {
  const name = `Repor ${run}`;
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: name, city: 'Braga' } })).json()).data as { id: string; number: number };
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Ligar ${run}` } });

  // A cópia: o Excel dos leads (como a cópia semanal) com a folha "Tarefas".
  const exported = await page.request.get(`/api/v1/leads/export?format=xlsx&q=${encodeURIComponent(name)}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await exported.body()) as unknown as ArrayBuffer);
  const tasks = workbook.addWorksheet('Tarefas');
  tasks.addRow(['Nº', 'Empresa', 'Tarefa', 'Prazo', 'Feita em']);
  tasks.addRow([lead.number, name, `Ligar ${run}`, null, null]);
  tasks.addRow([lead.number, name, `Enviar proposta ${run}`, '2026-12-01', null]);
  const file = Buffer.from(await workbook.xlsx.writeBuffer());
  const upload = { file: { name: 'copia.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: file } };

  // Com o lead ainda lá: falta só a tarefa nova.
  let preview = (await (await page.request.post('/api/v1/backup/restore/preview', { multipart: upload })).json()).data as {
    missing_leads: { number: number }[];
    missing_tasks: number;
    has_tasks: boolean;
  };
  expect(preview).toMatchObject({ missing_leads: [], missing_tasks: 1, has_tasks: true });

  // Apagado de vez: falta o lead (e as duas tarefas).
  await page.request.delete(`/api/v1/leads/${lead.id}`);
  const trash = (await (await page.request.get('/api/v1/leads/trash')).json()).data as { id: string; number: number }[];
  const item = trash.find((t) => t.number === lead.number)!;
  expect((await page.request.delete('/api/v1/leads/trash', { data: { ids: [item.id] } })).status()).toBe(200);
  preview = (await (await page.request.post('/api/v1/backup/restore/preview', { multipart: upload })).json()).data;
  expect(preview.missing_leads.map((l) => l.number)).toEqual([lead.number]);
  expect(preview.missing_tasks).toBe(2);

  // No ecrã: escolher a cópia, ver o que falta e repor.
  await page.goto('/definicoes/repor');
  await page.getByLabel('Ficheiro da cópia de segurança').setInputFiles({ name: 'copia.xlsx', mimeType: upload.file.mimeType, buffer: file });
  await expect(page.getByText(`Faltam 1 lead`)).toBeVisible();
  await page.getByRole('button', { name: 'Repor o que falta' }).click();
  await expect(page.getByText('Pronto: 1 lead reposto e 2 tarefas repostas.')).toBeVisible();

  const back = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(name)}`)).json()).data as { id: string; number: number; city: string }[];
  expect(back[0]).toMatchObject({ number: lead.number, city: 'Braga' });
  const restoredTasks = (await (await page.request.get(`/api/v1/leads/${back[0]!.id}/tasks`)).json()).data as { title: string }[];
  expect(restoredTasks.map((t) => t.title).sort()).toEqual([`Enviar proposta ${run}`, `Ligar ${run}`]);
  await page.request.delete(`/api/v1/leads/${back[0]!.id}`);
});
