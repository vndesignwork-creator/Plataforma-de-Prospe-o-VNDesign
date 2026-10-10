import { expect, test } from '@playwright/test';

/* Tarefas por lead: lista com caixas, ordem, prazos, listas prontas, "Hoje" e Definições. */
const run = Date.now().toString(36);
const iso = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });
};

test('ficha: acrescentar, reordenar com o teclado, concluir e editar tarefas', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Tarefas Ficha ${run}` } })).json()).data;
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');
  await expect(card.getByText('Ainda não há tarefas.')).toBeVisible();

  for (const title of ['Pedir fotos', 'Fazer maquete', 'Publicar site']) {
    await card.getByLabel('Nova tarefa').fill(title);
    await card.getByLabel('Nova tarefa').press('Enter');
    await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByText(title)).toBeVisible();
  }
  const pending = card.getByRole('list', { name: 'Tarefas por fazer' }).getByRole('listitem');
  await expect(pending).toHaveCount(3);

  // "Publicar site" sobe para o topo com o teclado.
  await card.getByRole('button', { name: 'Mover a tarefa: Publicar site' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(pending.first()).toContainText('Publicar site');
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data.map((t: { title: string }) => t.title))
    .toEqual(['Publicar site', 'Pedir fotos', 'Fazer maquete']);

  // Concluir: passa para "Concluídas" e fica na linha do tempo.
  await card.getByLabel('Concluir: Pedir fotos').click();
  await expect(card.getByText('1 de 3 tarefas concluída')).toBeVisible();
  await card.getByRole('button', { name: /Concluídas \(1\)/ }).click();
  await expect(card.getByRole('list', { name: 'Tarefas concluídas' }).getByText('Pedir fotos')).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Tarefa concluída')).toBeVisible();

  // Editar com prazo.
  await card.getByRole('button', { name: 'Editar: Fazer maquete' }).click();
  await card.getByLabel('Texto da tarefa').fill('Fazer maquete da página inicial');
  await card.getByLabel('Prazo da tarefa').fill(iso(-1));
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(card.getByText('Fazer maquete da página inicial')).toBeVisible();
  await expect(card.getByText('(em atraso)')).toBeAttached();

  // Links no texto ficam clicáveis (e não abrem a edição).
  await card.getByLabel('Nova tarefa').fill('Ver referência em oquintal.pt/menu.');
  await card.getByLabel('Nova tarefa').press('Enter');
  const link = card.getByRole('link', { name: 'oquintal.pt/menu' });
  await expect(link).toHaveAttribute('href', 'https://oquintal.pt/menu');
  await expect(link).toHaveAttribute('target', '_blank');

  // Escrever a seguinte logo a seguir não perde o texto.
  await card.getByLabel('Nova tarefa').fill('Primeira rápida');
  await card.getByLabel('Nova tarefa').press('Enter');
  await card.getByLabel('Nova tarefa').fill('Segunda rápida');
  await card.getByLabel('Nova tarefa').press('Enter');
  await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByText('Segunda rápida')).toBeVisible();
  await expect(card.getByLabel('Nova tarefa')).toHaveValue('');

  // Apagar.
  await card.getByRole('button', { name: 'Apagar: Publicar site' }).click();
  await expect(page.getByText('Tarefa apagada.')).toBeVisible();
  await expect(pending).toHaveCount(4);
});

test('lista pronta sugerida pelos serviços do lead (sem repetir tarefas)', async ({ page }) => {
  const lead = (
    await (await page.request.post('/api/v1/leads', { data: { company_name: `Tarefas Lista ${run}`, services: ['identidade_visual'], status: 'cliente' } })).json()
  ).data;
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');
  await card.getByRole('button', { name: /Identidade Visual · 10 tarefas/ }).click();
  await expect(page.getByText('10 tarefas de "Identidade Visual" acrescentadas.')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByRole('listitem')).toHaveCount(10);
  await expect(page.getByLabel('Atividade do lead').getByText('Lista de tarefas criada')).toBeVisible();

  // Outra vez pelo menu: já lá estão todas.
  await card.getByRole('button', { name: 'Usar lista' }).click();
  await page.getByRole('menuitem', { name: /Identidade Visual/ }).click();
  await expect(page.getByText('Estas tarefas já estão na lista.')).toBeVisible();

  // Progresso no Kanban e na lista.
  const board = await (await page.request.get(`/api/v1/board?q=${encodeURIComponent(`Tarefas Lista ${run}`)}`)).json();
  const onBoard = board.data.flatMap((c: { leads: { task_progress: unknown }[] }) => c.leads)[0];
  expect(onBoard.task_progress).toEqual({ total: 10, done: 0 });
  await page.goto(`/kanban`);
  await page.getByLabel('Filtrar leads no Kanban').fill(`Tarefas Lista ${run}`);
  // Espera pelo filtro (outras execuções podem ter leads parecidos).
  await expect(page.getByLabel('Leads em Cliente').getByText('0 de 10 tarefas concluídas')).toHaveCount(1);
});

test('"Hoje": tarefas com prazo aparecem e concluem-se no dashboard', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Tarefas Hoje ${run}` } })).json()).data;
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Ligar ao cliente ${run}`, due_on: iso(0) } });
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Entregar logótipo ${run}`, due_on: iso(3) } });

  await page.goto('/dashboard');
  const urgent = page.getByRole('region', { name: 'Tarefas para hoje' });
  await expect(urgent.getByText(`Ligar ao cliente ${run}`)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tarefas nos próximos 7 dias' }).getByText(`Entregar logótipo ${run}`)).toBeVisible();

  await urgent.getByLabel(`Concluir: Ligar ao cliente ${run}`).click();
  await expect(page.getByText(`Tarefa concluída: Ligar ao cliente ${run}`)).toBeVisible();
  await expect.poll(async () => {
    const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data;
    return tasks.filter((t: { done_at: string | null }) => t.done_at).length;
  }).toBe(1);
});

test('Definições: criar, editar e apagar uma lista de tarefas', async ({ page }) => {
  await page.goto('/definicoes#listas-tarefas');
  const card = page.locator('#listas-tarefas');
  await card.getByRole('button', { name: 'Nova lista' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova lista de tarefas' });
  await dialog.getByLabel('Nome').fill(`Vídeo ${run}`);
  await dialog.getByLabel(/Tarefas \(uma por linha\)/).fill('Guião\n\nFilmagens\nEdição');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Lista criada.')).toBeVisible();
  await expect(card.getByText(`Vídeo ${run}`)).toBeVisible();
  await expect(card.getByText('3 tarefas').last()).toBeVisible();

  await card.getByRole('button', { name: `Editar Vídeo ${run}` }).click();
  await page.getByRole('dialog').getByLabel('Serviço').selectOption('posts_redes');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Lista guardada.')).toBeVisible();

  await card.getByRole('button', { name: `Apagar Vídeo ${run}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar' }).click();
  await expect(page.getByText('Lista apagada.')).toBeVisible();
  await expect(card.getByText(`Vídeo ${run}`)).toHaveCount(0);
});

test('API: juntar leads leva as tarefas; anonimizar apaga-as', async ({ page }) => {
  const a = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Junta Tarefas A ${run}` } })).json()).data;
  const b = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Junta Tarefas B ${run}` } })).json()).data;
  await page.request.post(`/api/v1/leads/${b.id}/tasks`, { data: { title: 'Tarefa do duplicado' } });
  const merge = await page.request.post(`/api/v1/leads/${a.id}/merge`, { data: { duplicate_ids: [b.id] } });
  expect(merge.status()).toBe(200);
  const tasks = (await (await page.request.get(`/api/v1/leads/${a.id}/tasks`)).json()).data;
  expect(tasks.map((t: { title: string }) => t.title)).toEqual(['Tarefa do duplicado']);

  const anon = await page.request.post(`/api/v1/leads/${a.id}/anonymize`, { data: {} });
  expect(anon.status()).toBe(200);
  expect((await (await page.request.get(`/api/v1/leads/${a.id}/tasks`)).json()).data).toEqual([]);
});
