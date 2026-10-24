import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

/*
 * Trabalho em equipa e ficha: dar uma tarefa a alguém (aviso no sino e página
 * Tarefas), comentários com @menção, organizar os cartões da ficha e
 * Seguinte/Anterior a partir da lista.
 */
const run = Date.now().toString(36);

function localEnv(name: string): string | undefined {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

type LeadRow = { id: string; number: number; company_name: string };
async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as LeadRow;
}

test('equipa: dar uma tarefa, aviso no sino, página Tarefas e comentário com @menção', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const name = `Tânia ${run}`;
  const email = `tarefas-${run}@exemplo.pt`;
  const lead = await createLead(page.request, { company_name: `Equipa Tarefas ${run}` });

  // Convidar e aceitar (prospetora).
  const invited = await page.request.post('/api/v1/team/invites', { data: { email, name, role: 'prospector', send_email: false } });
  expect(invited.status(), await invited.text()).toBeLessThan(300);
  const team = (await (await page.request.get('/api/v1/team')).json()).data as { invites: { email: string; token: string }[] };
  const invite = team.invites.find((i) => i.email === email)!;
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await context.newPage();
  let userId: string | undefined;
  try {
    await other.goto(`/equipa/${invite.token}`);
    await other.getByLabel('O teu nome').fill(name);
    await other.getByLabel('Escolhe uma palavra-passe').fill(`Tarefas-${run}-pw`);
    await other.getByRole('button', { name: 'Criar conta e aceitar' }).click();
    await expect(other).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    userId = ((await (await other.request.get('/api/v1/me')).json()).data as { user: { id: string } }).user.id;

    // Dono: dá a tarefa na ficha (editar → Responsável).
    expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Ligar ao dono ${run}` } })).status()).toBe(201);
    await page.goto(`/leads/${lead.id}`);
    const tasks = page.locator('#tarefas');
    await tasks.getByRole('button', { name: `Editar: Ligar ao dono ${run}` }).click();
    const editor = page.getByRole('dialog', { name: 'Editar tarefa' });
    await editor.getByLabel('Responsável').selectOption(userId);
    await editor.getByRole('button', { name: 'Guardar' }).click();
    await expect(tasks.getByText(name)).toBeVisible();

    // A outra pessoa: aviso no sino, abre o lead; e vê-a em Tarefas → As minhas.
    await other.goto('/tarefas');
    const bell = other.getByRole('button', { name: /^Avisos: 1 por ler$/ }).first();
    await expect(bell).toBeVisible({ timeout: 15_000 });
    await expect(other.getByRole('list', { name: 'Sem prazo' }).getByText(`Ligar ao dono ${run}`)).toBeVisible();
    await bell.click();
    await other.getByRole('menuitem', { name: new RegExp(`deu-te uma tarefa.*Ligar ao dono ${run}`) }).click();
    await expect(other).toHaveURL(new RegExp(`/leads/.*#tarefas$`));
    await expect(other.getByRole('button', { name: /^Avisos$/ }).first()).toBeVisible();

    // Concluir na página Tarefas (com Anular).
    await other.goto('/tarefas');
    await other.getByLabel(`Concluir: Ligar ao dono ${run}`).check();
    await expect(other.getByText('Tarefa concluída.')).toBeVisible();
    await expect(other.getByText('Não tens tarefas por fazer')).toBeVisible();

    // Dono: comentário com @menção (escolhida na lista que aparece ao escrever @).
    await page.goto(`/leads/${lead.id}`);
    await page.getByRole('button', { name: 'Registar' }).click();
    await page.getByLabel('Tipo de registo').selectOption('comment');
    const box = page.getByLabel('Texto do registo');
    await box.pressSequentially(`@${name.slice(0, 3)}`);
    await page.getByRole('listbox', { name: 'Mencionar' }).getByRole('option', { name }).click();
    await box.pressSequentially('liga tu amanhã');
    await page.getByRole('form', { name: 'Registar contacto' }).getByRole('button', { name: 'Registar' }).click();
    await expect(page.getByText(/Comentário guardado; a pessoa mencionada foi avisada/)).toBeVisible();
    const timeline = page.getByRole('list', { name: 'Atividade do lead' });
    await expect(timeline.getByText('Comentário da equipa')).toBeVisible();
    await expect(timeline.getByText(`@${name}`, { exact: true })).toBeVisible();

    // A outra pessoa recebe o aviso da menção.
    const notes = (await (await other.request.get('/api/v1/notifications')).json()) as { data: { kind: string; text: string }[]; unread: number };
    expect(notes.unread).toBe(1);
    expect(notes.data[0]).toMatchObject({ kind: 'mention', text: `@${name} liga tu amanhã` });
    expect((await other.request.post('/api/v1/notifications/read', { data: { all: true } })).status()).toBe(200);
    expect(((await (await other.request.get('/api/v1/notifications')).json()) as { unread: number }).unread).toBe(0);

    // Só membros da equipa: dar a tarefa a alguém de fora falha.
    const bad = await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: 'X', assigned_to: '00000000-0000-4000-8000-000000000000' } });
    expect(bad.status()).toBe(400);
  } finally {
    await context.close();
    if (userId) {
      const url = localEnv('NEXT_PUBLIC_SUPABASE_URL')!;
      const key = localEnv('SUPABASE_SECRET_KEY')!;
      const admin = await playwrightRequest.newContext();
      await admin.delete(`${url}/auth/v1/admin/users/${userId}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      await admin.dispose();
    }
  }
});

test('organizar os cartões da ficha: esconder e mudar a ordem (e repor)', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Cartões ${run}` });
  expect((await page.request.put('/api/v1/preferences/lead.cards', { data: { value: { order: [], hidden: [] } } })).status()).toBeLessThan(300);
  await page.goto(`/leads/${lead.id}`);
  const aside = page.getByRole('complementary', { name: 'Tarefas, pagamentos, notas, propostas e atividade' });
  await expect(aside.getByRole('heading', { name: 'Notas' })).toBeVisible();

  await aside.getByRole('button', { name: 'Organizar cartões' }).click();
  const dialog = page.getByRole('dialog', { name: 'Organizar cartões' });
  await dialog.getByLabel('Mostrar Notas').uncheck();
  await expect(dialog.getByLabel('Mostrar Linha do tempo')).toBeDisabled();
  // A Linha do tempo sobe até ao topo.
  for (let i = 0; i < 12; i++) {
    const up = dialog.getByRole('button', { name: 'Subir Linha do tempo' });
    if (await up.isDisabled()) break;
    await up.click();
  }
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Ficha organizada.')).toBeVisible();
  await expect(aside.getByRole('heading', { name: 'Notas' })).toHaveCount(0);
  await expect(aside.getByRole('heading').first()).toHaveText('Linha do tempo');

  // Vale para os outros leads; Repor original volta ao que era.
  await page.reload();
  await expect(aside.getByRole('heading').first()).toHaveText('Linha do tempo');
  await aside.getByRole('button', { name: 'Organizar cartões' }).click();
  await page.getByRole('dialog', { name: 'Organizar cartões' }).getByRole('button', { name: 'Repor original' }).click();
  await expect(page.getByText('Ordem original reposta.')).toBeVisible();
  await expect(aside.getByRole('heading', { name: 'Notas' })).toBeVisible();
  await expect(aside.getByRole('heading').first()).toHaveText('Tarefas');
});

test('Seguinte/Anterior na ficha a partir da lista (setas e J/K)', async ({ page }) => {
  const name = `Pager ${run}`;
  for (const s of ['A', 'B', 'C']) await createLead(page.request, { company_name: `${name} ${s}` });
  await page.goto(`/leads?q=${encodeURIComponent(name)}&sort=company_name&order=asc`);
  await expect(page.getByText(/^3 leads com estes filtros/)).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`${name} A$`) }).first().click();
  await expect(page.getByRole('heading', { name: `${name} A` })).toBeVisible();
  const pager = page.getByRole('navigation', { name: 'Leads da lista' });
  await expect(pager.getByText('1 de 3')).toBeVisible();
  await expect(pager.getByRole('button', { name: 'Lead anterior' })).toBeDisabled();

  await pager.getByRole('button', { name: 'Lead seguinte' }).click();
  await expect(page.getByRole('heading', { name: `${name} B` })).toBeVisible();
  await expect(pager.getByText('2 de 3')).toBeVisible();
  await page.keyboard.press('j');
  await expect(page.getByRole('heading', { name: `${name} C` })).toBeVisible();
  await expect(pager.getByRole('button', { name: 'Lead seguinte' })).toBeDisabled();
  await page.keyboard.press('k');
  await expect(page.getByRole('heading', { name: `${name} B` })).toBeVisible();

  // "2 de 3" volta à lista com os mesmos filtros.
  await pager.getByRole('link', { name: '2 de 3' }).click();
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(name).replace(/%20/g, '(\\+|%20)')}`));
});

test('Tarefas: as do dono (sem responsável) aparecem, pelo prazo, e concluem-se daqui', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Página Tarefas ${run}` });
  expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Enviar maquete ${run}`, due_on: '2020-01-10' } })).status()).toBe(201);
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Principal' }).first().getByRole('link', { name: 'Tarefas' }).click();
  await expect(page).toHaveURL(/\/tarefas$/);
  const overdue = page.getByRole('list', { name: 'Em atraso' });
  await expect(overdue.getByText(`Enviar maquete ${run}`)).toBeVisible();
  await expect(overdue.getByRole('link', { name: new RegExp(`Página Tarefas ${run}`) })).toBeVisible();
  await page.getByLabel(`Concluir: Enviar maquete ${run}`).check();
  await expect(page.getByText('Tarefa concluída.')).toBeVisible();
  await expect(page.getByText(`Enviar maquete ${run}`)).toHaveCount(0);
});

test('Tarefas: dar prazo a uma tarefa sem prazo daqui mesmo (com Anular)', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Prazo Tarefas ${run}` });
  const res = await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Rever textos ${run}` } });
  const task = (await res.json()).data as { id: string };
  const due = async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string | null }[]).find((t) => t.id === task.id)!.due_on;
  await page.goto('/tarefas?de=all');
  await expect(page.getByRole('list', { name: 'Sem prazo' }).getByText(`Rever textos ${run}`)).toBeVisible();

  await page.getByRole('button', { name: `Prazo de Rever textos ${run}` }).click();
  await page.getByRole('menuitem', { name: /^Amanhã/ }).click();
  await expect(page.getByText(/^Prazo: \d{2}\/\d{2}\/\d{4}\.$/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Próximos 7 dias' }).getByText(`Rever textos ${run}`)).toBeVisible();
  expect(await due()).not.toBeNull();

  await page.locator('[data-sonner-toast]').filter({ hasText: 'Prazo:' }).getByRole('button', { name: 'Anular' }).click();
  await expect.poll(due).toBeNull();
  await expect(page.getByRole('list', { name: 'Sem prazo' }).getByText(`Rever textos ${run}`)).toBeVisible();

  // Escolher data… abre o calendário por baixo da tarefa.
  await page.getByRole('button', { name: `Prazo de Rever textos ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Escolher data…' }).click();
  await expect(page.getByLabel(`Data do prazo de Rever textos ${run}`)).toBeVisible();
});
