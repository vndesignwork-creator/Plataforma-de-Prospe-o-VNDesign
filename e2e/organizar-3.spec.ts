import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Motivo de "Sem interesse" (ficha, Kanban, ações em massa, gráfico e filtro),
 * tempo em cada fase, ficheiros de um lead que ainda não é cliente, o que mudou
 * (com "Repor") e o email de boas-vindas ao novo cliente.
 */
const run = Date.now().toString(36);

type LeadRow = { id: string; number: number; company_name: string; status: string; lost_reason: string | null; phone: string | null; city: string | null };

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as LeadRow;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data as LeadRow;
const ids = async (request: APIRequestContext, query: string) =>
  ((await (await request.get(`/api/v1/leads?${query}`)).json()).data as { id: string }[]).map((l) => l.id);

test('motivo de "Sem interesse": na ficha, no Kanban, em massa, no gráfico e no filtro', async ({ page }) => {
  test.setTimeout(120_000);
  const name = `Perdido ${run}`;
  const a = await createLead(page.request, { company_name: `${name} A`, status: 'contactado' });
  const b = await createLead(page.request, { company_name: `${name} B` });
  const c = await createLead(page.request, { company_name: `${name} C` });
  const d = await createLead(page.request, { company_name: `${name} D` });

  // Ficha: pergunta o motivo; Cancelar deixa o estado como estava.
  await page.goto(`/leads/${a.id}`);
  await page.getByLabel('Estado', { exact: true }).selectOption('sem_interesse');
  const dialog = page.getByRole('dialog', { name: 'Porque fica “Sem interesse”?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect((await getLead(page.request, a.id)).status).toBe('contactado');

  await page.getByLabel('Estado', { exact: true }).selectOption('sem_interesse');
  await dialog.getByLabel('Preço').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Estado: Sem interesse.')).toBeVisible();
  expect(await getLead(page.request, a.id)).toMatchObject({ status: 'sem_interesse', lost_reason: 'preco' });
  // Na ficha muda-se o motivo; na linha do tempo fica com a mudança de estado.
  await expect(page.getByLabel('Motivo de “Sem interesse”')).toHaveValue('preco');
  await expect(page.getByRole('list', { name: 'Atividade do lead' }).getByText('Contactado → Sem interesse · Motivo: Preço')).toBeVisible();
  await page.getByLabel('Motivo de “Sem interesse”').selectOption('ja_tem_site');
  await expect.poll(async () => (await getLead(page.request, a.id)).lost_reason).toBe('ja_tem_site');

  // Kanban: pelo menu ⇄; depois de mover, pergunta o motivo.
  await page.goto('/kanban');
  await page.getByLabel('Filtrar leads no Kanban').fill(b.company_name);
  await page.getByRole('button', { name: new RegExp(`^Mudar estado de .*${b.company_name}$`) }).click();
  await page.getByRole('menuitem', { name: 'Sem interesse' }).click();
  const kanbanDialog = page.getByRole('dialog', { name: 'Porque fica “Sem interesse”?' });
  await kanbanDialog.getByLabel('Agora não (talvez mais tarde)').check();
  await kanbanDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(async () => (await getLead(page.request, b.id)).lost_reason).toBe('agora_nao');

  // Em massa: um motivo para todos os selecionados.
  await page.goto(`/leads?q=${encodeURIComponent(name)}&status=identificado`);
  await page.getByRole('checkbox', { name: `Selecionar #${c.number} ${c.company_name}` }).check();
  await page.getByRole('checkbox', { name: `Selecionar #${d.number} ${d.company_name}` }).check();
  await page.getByRole('region', { name: 'Ações nos leads selecionados' }).getByRole('button', { name: 'Estado…' }).click();
  await page.getByRole('menuitem', { name: 'Sem interesse' }).click();
  const bulkDialog = page.getByRole('dialog', { name: 'Porque ficam “Sem interesse”?' });
  await bulkDialog.getByLabel('Não responde').check();
  await bulkDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('2 leads mudaram de estado para “Sem interesse”.')).toBeVisible();
  expect((await getLead(page.request, d.id)).lost_reason).toBe('nao_responde');

  // Sai sozinho noutro estado.
  expect((await page.request.patch(`/api/v1/leads/${d.id}`, { data: { status: 'identificado' } })).status()).toBe(200);
  expect((await getLead(page.request, d.id)).lost_reason).toBeNull();

  // Filtro por motivo (API e lista).
  const q = `q=${encodeURIComponent(name)}`;
  expect(await ids(page.request, `${q}&lost=nao_responde`)).toEqual([c.id]);
  expect((await ids(page.request, `${q}&lost=ja_tem_site,agora_nao`)).sort()).toEqual([a.id, b.id].sort());
  await page.goto(`/leads?${q}&status=sem_interesse&motivo=agora_nao`);
  await expect(page.getByText(/^1 lead com estes filtros/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Motivo: 1 selecionado(s)' })).toBeVisible();

  // Estatísticas: "Porque perdes leads".
  await page.goto('/estatisticas');
  const chart = page.getByRole('table', { name: 'Leads em Sem interesse por motivo' });
  await expect(chart.getByText('Já tem site / fornecedor')).toBeVisible();
  await expect(chart.getByText('Não responde')).toBeVisible();
});

test('tempo na fase: na ficha, no Kanban e filtro "Na fase há"', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Fase ${run}`, status: 'contactado' });
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByText('Nesta fase', { exact: true })).toBeVisible();
  await expect(page.getByTitle('Nesta fase desde hoje')).toBeVisible();

  await page.goto('/kanban');
  await page.getByLabel('Filtrar leads no Kanban').fill(lead.company_name);
  await expect(page.getByLabel('Leads em Contactado').getByText('hoje nesta fase')).toBeVisible();

  // Acabado de mudar: não está parado.
  const q = `q=${encodeURIComponent(lead.company_name)}`;
  expect(await ids(page.request, q)).toEqual([lead.id]);
  expect(await ids(page.request, `${q}&stale=7`)).toEqual([]);
  expect((await page.request.get(`/api/v1/leads?stale=0`)).status()).toBe(400);

  await page.goto(`/leads?${q}`);
  await page.getByRole('button', { name: /^Na fase há:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Na fase há mais de 7 dias' }).click();
  await expect(page).toHaveURL(/parado=7/);
  await expect(page.getByText('Nenhum lead com estes filtros')).toBeVisible();
});

test('ficheiros de um lead que ainda não é cliente (ficam no kit ao ganhar)', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Ficheiros ${run}` });
  await page.goto(`/leads/${lead.id}`);
  const card = page.getByRole('region', { name: 'Ficheiros do lead' });
  await card.locator('input[type="file"]').setInputFiles({ name: 'montra.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  await expect(page.getByText('Ficheiro guardado.')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Lista de ficheiros do lead' }).getByText('montra.png')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ficheiros (1)' })).toBeVisible();

  // Passa a cliente: o mesmo ficheiro está no kit da marca.
  expect((await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { status: 'cliente' } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Ficheiros do lead' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Ficheiros do kit' }).getByText('montra.png')).toBeVisible();
});

test('o que mudou: valores de antes e depois e "Repor"', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Mudou ${run}`, phone: '912345678', city: 'Porto' });
  expect((await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { phone: '934567890', city: 'Braga' } })).status()).toBe(200);

  await page.goto(`/leads/${lead.id}`);
  const changes = page.getByRole('list', { name: 'O que mudou' }).first();
  await expect(changes.getByText('912345678')).toBeVisible();
  await expect(changes.getByText('934567890')).toBeVisible();
  await expect(changes.getByText('Porto')).toBeVisible();

  await changes.getByRole('button', { name: 'Repor Telefone' }).click();
  await expect(page.getByText('Telefone reposto.')).toBeVisible();
  await expect.poll(async () => (await getLead(page.request, lead.id)).phone).toBe('912345678');
  expect((await getLead(page.request, lead.id)).city).toBe('Braga');
  // Já reposto: a edição antiga deixa de ter "Repor" no telefone (a nova regista a reposição).
  const timeline = page.getByRole('list', { name: 'Atividade do lead' });
  await expect(timeline.getByRole('button', { name: 'Repor Telefone' })).toHaveCount(1);
  await expect(timeline.getByRole('button', { name: 'Repor Cidade' })).toHaveCount(1);
});

test('boas-vindas ao novo cliente: copiar o texto e depois sai', async ({ page }) => {
  const name = `Bem-vindo ${run}`;
  const lead = await createLead(page.request, { company_name: name, contact_name: 'Rita Sousa', status: 'cliente' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/leads/${lead.id}`);
  // Sem email do cliente: copia o texto (com email e a conta de envio ligada, abre-o para rever e enviar).
  const project = page.locator('#projeto');
  await project.getByRole('button', { name: 'Boas-vindas' }).click();
  await expect(page.getByText(/Boas-vindas copiado/)).toBeVisible();
  const body = await page.evaluate(() => navigator.clipboard.readText());
  // Já copiado: daqui em diante é o ponto de situação.
  await expect(project.getByRole('button', { name: 'Boas-vindas' })).toHaveCount(0);
  await expect(project.getByRole('button', { name: 'Ponto de situação' })).toBeVisible();
  expect(body).toContain('Olá Rita,');
  expect(body).toContain(`Obrigado pela confiança! Fico muito contente por começarmos o projeto ${name}.`);
  expect(body).toContain('Para arrancar:');
});

test('duplicar uma tarefa (logo a seguir à original, com Anular)', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Duplicar ${run}` });
  for (const title of ['Pedir fotos', 'Publicar site']) {
    expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title, due_on: '2030-01-15' } })).status()).toBe(201);
  }
  const titles = async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; due_on: string | null }[]);
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');
  await card.getByRole('button', { name: 'Duplicar: Pedir fotos' }).click();
  await expect(page.getByText('Tarefa duplicada.')).toBeVisible();
  await expect.poll(async () => (await titles()).map((t) => t.title)).toEqual(['Pedir fotos', 'Pedir fotos', 'Publicar site']);
  expect((await titles())[1]!.due_on).toBe('2030-01-15');
  await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByRole('listitem')).toHaveCount(3);

  await page.locator('[data-sonner-toast]').filter({ hasText: 'Tarefa duplicada.' }).getByRole('button', { name: 'Anular' }).click();
  await expect.poll(async () => (await titles()).map((t) => t.title)).toEqual(['Pedir fotos', 'Publicar site']);
});

test('notas: recolher (fica o início à vista) e Notas com IA no cartão', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Notas ${run}`, notes: 'Atende depois das 15h. Falar com a Marta.' });
  await page.goto(`/leads/${lead.id}`);
  const notes = page.locator('div').filter({ has: page.getByRole('button', { name: 'Editar notas' }) }).last();
  await expect(notes.getByRole('button', { name: 'Notas com IA' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notas com IA' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Recolher: Notas' }).click();
  await expect(page.getByRole('button', { name: 'Expandir: Notas' })).toBeVisible();
  // O texto completo sai; o início fica como descrição.
  await expect(page.getByText('Atende depois das 15h. Falar com a Marta.')).toHaveCount(1);
  // Editar abre mesmo recolhido.
  await page.getByRole('button', { name: 'Editar notas' }).click();
  await expect(page.getByLabel('Notas do lead')).toHaveValue('Atende depois das 15h. Falar com a Marta.');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Expandir: Notas' }).click();
  await expect(page.getByRole('button', { name: 'Recolher: Notas' })).toBeVisible();
});

test('o site deixa usar o microfone (ditado) mas não a câmara nem outros sites', async ({ request }) => {
  const policy = (await request.get('/login')).headers()['permissions-policy'];
  expect(policy).toContain('microphone=(self)');
  expect(policy).toContain('camera=()');
});
