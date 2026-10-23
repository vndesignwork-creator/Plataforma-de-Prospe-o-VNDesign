import { expect, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Etiquetas, limpeza de duplicados (juntar sem perder pagamentos/reuniões/horas),
 * Agenda da semana, notas de reunião com IA, ações e recentes na pesquisa rápida,
 * avisos dos projetos no Dashboard e o "Ponto de situação".
 * IA falsa em e2e/stubs.ts.
 */
const run = Date.now().toString(36);
// Dias de calendário em Lisboa (somar 24 h falha na mudança de hora).
const iso = (days: number) => {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number; company_name: string };
}

test('etiquetas: na ficha, filtro na lista e na API, e na pesquisa rápida', async ({ page }) => {
  test.setTimeout(90_000);
  const tag = `Feira ${run}`;
  const lead = await createLead(page.request, { company_name: `Etiquetado ${run}` });
  const other = await createLead(page.request, { company_name: `Sem Etiqueta ${run}` });

  await page.goto(`/leads/${lead.id}`);
  const input = page.getByLabel('Nova etiqueta');
  await input.fill(tag);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: `Tirar a etiqueta ${tag}` })).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { tags: string[] }).tags).toEqual([tag]);
  // Repetida (outra maneira de escrever) não entra duas vezes.
  await input.fill(tag.toUpperCase());
  await input.press('Enter');
  await expect(page.getByRole('button', { name: /^Tirar a etiqueta/ })).toHaveCount(1);

  const list = (await (await page.request.get(`/api/v1/leads?tag=${encodeURIComponent(tag)}`)).json()).data as { id: string }[];
  expect(list.map((l) => l.id)).toEqual([lead.id]);
  const counts = (await (await page.request.get('/api/v1/leads/tags')).json()).data as { tag: string; count: number }[];
  expect(counts).toContainEqual({ tag, count: 1 });

  await page.goto(`/leads?etiqueta=${encodeURIComponent(tag)}`);
  await expect(page.getByText(/^1 lead com estes filtros/)).toBeVisible();
  await expect(page.getByRole('link', { name: `Etiquetado ${run}` }).first()).toBeVisible();
  await expect(page.getByText(`Sem Etiqueta ${run}`)).toHaveCount(0);
  expect(other.id).toBeTruthy();

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(tag);
  await page.getByRole('option', { name: `Leads com a etiqueta “${tag}”` }).click();
  await expect(page).toHaveURL(new RegExp(`etiqueta=${encodeURIComponent(tag).replace(/%/g, '%')}`));
});

test('duplicados: juntar no principal passa pagamentos, reuniões, horas e etiquetas; "não são duplicados" esconde', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `dup-${run}@exemplo.pt`;
  const main = await createLead(page.request, { company_name: `Duplicado Cliente ${run}`, email, status: 'cliente', tags: ['principal'] });
  const dup = await createLead(page.request, { company_name: `Duplicado Outro ${run}`, email, tags: ['repetido'] });
  expect((await page.request.post(`/api/v1/leads/${dup.id}/payments`, { data: { description: 'Sinal', amount: 250, due_on: iso(10) } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/leads/${dup.id}/meetings`, { data: { starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString() } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/leads/${dup.id}/time`, { data: { date: iso(0), minutes: 45 } })).status()).toBe(201);
  // Outro par que não é duplicado de verdade (mesmo nome).
  const a = await createLead(page.request, { company_name: `Café Igual ${run}`, city: 'Porto' });
  const b = await createLead(page.request, { company_name: `Café Igual ${run}`, city: 'Faro' });

  await page.goto('/leads/duplicados');
  const groups = page.getByRole('list', { name: 'Grupos de duplicados' });
  const ours = groups.getByRole('listitem').filter({ hasText: `Duplicado Outro ${run}` });
  await expect(ours).toContainText('mesmo email');
  // Principal sugerido: o cliente.
  await expect(ours.getByRole('radio', { name: `Fica #${main.number} Duplicado Cliente ${run}` })).toBeChecked();
  await ours.getByRole('button', { name: `Juntar em #${main.number} Duplicado Cliente ${run}` }).click();
  await expect(page.getByText(`Juntado em #${main.number} Duplicado Cliente ${run}.`)).toBeVisible({ timeout: 20_000 });

  expect((await page.request.get(`/api/v1/leads/${dup.id}`)).status()).toBe(404);
  const payments = (await (await page.request.get(`/api/v1/leads/${main.id}/payments`)).json()).data as unknown[];
  const meetings = (await (await page.request.get(`/api/v1/leads/${main.id}/meetings`)).json()).data as unknown[];
  const time = (await (await page.request.get(`/api/v1/leads/${main.id}/time`)).json()).data as { entries: unknown[] };
  expect(payments).toHaveLength(1);
  expect(meetings).toHaveLength(1);
  expect(time.entries).toHaveLength(1);
  const merged = (await (await page.request.get(`/api/v1/leads/${main.id}`)).json()).data as { tags: string[] };
  expect([...merged.tags].sort()).toEqual(['principal', 'repetido']);

  const cafe = groups.getByRole('listitem').filter({ hasText: `Café Igual ${run}` });
  await expect(cafe).toContainText('mesmo nome');
  await cafe.getByRole('button', { name: 'Não são duplicados' }).click();
  await expect(groups.getByRole('listitem').filter({ hasText: `Café Igual ${run}` })).toHaveCount(0);
  const left = (await (await page.request.get('/api/v1/leads/duplicates')).json()).data as { leads: { id: string }[] }[];
  expect(left.some((g) => g.leads.some((l) => l.id === a.id || l.id === b.id))).toBe(false);
});

test('agenda da semana: follow-ups, tarefas e mudar o dia', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Agenda ${run}`, next_action_text: `Ligar ${run}`, next_action_on: iso(0) });
  const task = (await (await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Tarefa agenda ${run}`, due_on: iso(0) } })).json()).data as { id: string };

  await page.goto('/agenda');
  const followUp = page.getByRole('article', { name: new RegExp(`Follow-up: Ligar ${run}`) });
  await expect(followUp).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('article', { name: new RegExp(`Tarefa: Tarefa agenda ${run}`) })).toBeVisible();

  // Passar a tarefa para a próxima semana (o menu serve no telemóvel e no teclado).
  await page.getByRole('button', { name: `Mudar o dia: Tarefa agenda ${run}` }).click();
  await page.getByRole('menuitem', { name: /Próxima semana/ }).click();
  await expect(page.getByText(/Tarefa passou para/)).toBeVisible();
  await expect
    .poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string }[]).find((t) => t.id === task.id)?.due_on)
    .not.toBe(iso(0));

  // Concluir o follow-up noutro dia: o lead muda a próxima ação.
  await page.getByRole('button', { name: `Mudar o dia: Ligar ${run}` }).click();
  await page.getByRole('menuitem', { name: /Próxima semana/ }).click();
  await expect
    .poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { next_action_on: string }).next_action_on)
    .not.toBe(iso(0));
});

test('notas de reunião com IA: resumo na linha do tempo, tarefas e próximo passo', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Notas IA ${run}`, contact_name: 'Marta' });
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Notas com IA' }).click();
  const dialog = page.getByRole('dialog', { name: 'Notas com IA' });
  await dialog.getByLabel('Apontamentos').fill('Falei com a Marta. Querem loja online até ao Natal, até 2000 €. Mandar proposta até sexta e ligar para a semana.');
  await dialog.getByRole('button', { name: 'Resumir' }).click();
  await expect(dialog.getByLabel('Resumo (vai para a linha do tempo)')).toHaveValue(/loja online até ao Natal/, { timeout: 30_000 });
  await expect(dialog.getByLabel('Tarefa 1', { exact: true })).toHaveValue('Enviar proposta da loja online');
  // A segunda tarefa fica de fora.
  await dialog.getByLabel('Criar a tarefa 2').uncheck();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/Guardado: resumo, 1 tarefa e próximo passo/)).toBeVisible();

  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; due_on: string | null }[];
  expect(tasks.map((t) => t.title)).toEqual(['Enviar proposta da loja online']);
  expect(tasks[0]!.due_on).toBe(iso(3));
  const saved = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { next_action_text: string; next_action_on: string };
  expect(saved).toMatchObject({ next_action_text: 'Ligar para saber a decisão', next_action_on: iso(7) });
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string; body: string | null }[];
  expect(activities.some((a) => a.type === 'note' && a.body?.includes('Resumo da reunião/chamada'))).toBe(true);
});

test('pesquisa rápida: recentes e ações num lead (tarefa e chamada sem abrir a ficha)', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Ações Rápidas ${run}` });
  // Abrir a ficha põe o lead nos recentes.
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('heading', { name: `Ações Rápidas ${run}` })).toBeVisible();
  await page.goto('/dashboard');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox');
  await expect(page.getByRole('option', { name: new RegExp(`#${lead.number} Ações Rápidas ${run}`) }).first()).toBeVisible();

  // → no lead: ações; "Nova tarefa…" escreve na mesma caixa.
  await box.press('ArrowRight');
  await page.getByRole('option', { name: 'Nova tarefa…' }).click();
  await page.getByRole('combobox', { name: /Título da tarefa/ }).fill(`Tarefa rápida ${run}`);
  await page.getByRole('combobox', { name: /Título da tarefa/ }).press('Enter');
  await expect(page.getByText(`Tarefa criada em Ações Rápidas ${run}.`)).toBeVisible();
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string }[];
  expect(tasks.map((t) => t.title)).toContain(`Tarefa rápida ${run}`);

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(`Ações Rápidas ${run}`);
  await page.getByRole('button', { name: new RegExp(`Ações para #${lead.number}`) }).first().click();
  await page.getByRole('option', { name: 'Registar chamada…' }).click();
  await page.getByRole('combobox', { name: /Como correu a chamada/ }).fill('Pediu para ligar em março');
  await page.getByRole('combobox', { name: /Como correu a chamada/ }).press('Enter');
  await expect(page.getByText(`Chamada registada em Ações Rápidas ${run}.`)).toBeVisible();
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string; body: string | null }[];
  expect(activities.some((a) => a.type === 'call_logged' && a.body === 'Pediu para ligar em março')).toBe(true);

  // Marcar reunião: abre a ficha com o formulário aberto.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(`Ações Rápidas ${run}`);
  await page.getByRole('button', { name: new RegExp(`Ações para #${lead.number}`) }).first().click();
  await page.getByRole('option', { name: 'Marcar reunião' }).click();
  await expect(page.getByRole('dialog', { name: /reunião/i })).toBeVisible({ timeout: 30_000 });
});

test('Dashboard: projetos a precisar de atenção levam aos Projetos já filtrados; Ponto de situação', async ({ page }) => {
  test.setTimeout(90_000);
  const name = `Atenção ${run}`;
  const lead = await createLead(page.request, { company_name: name, status: 'cliente', email: `atencao-${run}@exemplo.pt`, contact_name: 'Rui Costa' });
  await page.request.patch(`/api/v1/leads/${lead.id}/project`, { data: { due_on: iso(-3) } });
  const task = (await (await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Maquete ${run}` } })).json()).data as { id: string };
  await page.request.patch(`/api/v1/tasks/${task.id}`, { data: { done: true } });
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Página de contactos ${run}`, due_on: iso(5) } });

  await page.goto('/dashboard');
  const attention = page.getByRole('status', { name: 'Projetos a precisar de atenção' });
  await attention.getByRole('link', { name: /com a entrega atrasada/ }).click();
  await expect(page).toHaveURL(/\/projetos\?filtro=atrasados$/);
  await expect(page.getByRole('group', { name: 'Filtrar projetos' }).getByRole('button', { name: /^Atrasados/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('list', { name: 'Projetos em curso' }).getByText(name)).toBeVisible();

  // Ponto de situação: o que foi feito, os próximos passos e a assinatura (sem conta de email ligada, copia o texto).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/leads/${lead.id}`);
  await page.locator('#projeto').getByRole('button', { name: 'Ponto de situação' }).click();
  const account = (await (await page.request.get('/api/v1/mail-account')).json()).data;
  let body: string;
  if (account) {
    const dialog = page.getByRole('dialog', { name: 'Ponto de situação' });
    await expect(dialog.getByLabel('Assunto')).toHaveValue(`Ponto de situação — ${name}`, { timeout: 30_000 });
    body = await dialog.getByLabel('Mensagem').inputValue();
  } else {
    await expect(page.getByText(/Ponto de situação copiado/)).toBeVisible();
    body = await page.evaluate(() => navigator.clipboard.readText());
  }
  expect(body).toContain('Olá Rui,');
  expect(body).toContain(`Concluído:\n• Maquete ${run}`);
  expect(body).toContain(`Próximos passos:\n• Página de contactos ${run}`);
});
