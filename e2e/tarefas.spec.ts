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
  // A mais recente fica em cima.
  await expect(pending.first()).toContainText('Publicar site');

  // "Pedir fotos" (a primeira escrita, agora em baixo) sobe para o topo com o teclado.
  await card.getByRole('button', { name: 'Mover a tarefa: Pedir fotos' }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(pending.first()).toContainText('Pedir fotos');
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data.map((t: { title: string }) => t.title))
    .toEqual(['Pedir fotos', 'Publicar site', 'Fazer maquete']);

  // Concluir: passa para "Concluídas" e fica na linha do tempo.
  await card.getByLabel('Concluir: Pedir fotos').click();
  await expect(card.getByText('1 de 3 tarefas concluída')).toBeVisible();
  await card.getByRole('button', { name: /Concluídas \(1\)/ }).click();
  await expect(card.getByRole('list', { name: 'Tarefas concluídas' }).getByText('Pedir fotos')).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Tarefa concluída')).toBeVisible();

  // Editar com prazo.
  await card.getByText('Fazer maquete', { exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar tarefa' });
  await edit.getByLabel('Texto da tarefa').fill('Fazer maquete da página inicial');
  await edit.getByLabel('Prazo da tarefa').fill(iso(-1));
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(edit).toHaveCount(0);
  await expect(card.getByText('Fazer maquete da página inicial')).toBeVisible();

  // Texto comprido: na janela vê-se todo, com várias linhas (Shift+Enter muda de linha).
  await card.getByText('Fazer maquete da página inicial').first().click();
  const long = 'Fazer maquete da página inicial com o menu, o banner com a fotografia da equipa, a secção de serviços e o formulário de contacto';
  await edit.getByLabel('Texto da tarefa').fill(long);
  await edit.getByLabel('Texto da tarefa').press('Shift+Enter');
  await edit.getByLabel('Texto da tarefa').pressSequentially('Confirmar cores com o cliente');
  await expect(edit.getByText(/^\d+\/300$/)).toBeVisible();
  await edit.getByLabel('Texto da tarefa').press('Enter');
  await expect(edit).toHaveCount(0);
  await expect(card.getByText(/formulário de contacto\s*Confirmar cores com o cliente/)).toBeVisible();
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

  // Prazo pelos atalhos do botão "Prazo" e por "Escolher data…".
  await card.getByLabel('Nova tarefa').fill('Enviar orçamento');
  await card.getByRole('button', { name: 'Prazo (opcional)' }).click();
  await page.getByRole('menuitem', { name: /Amanhã/ }).click();
  await expect(card.getByRole('button', { name: /^Prazo: Amanhã/ })).toBeVisible();
  await card.getByLabel('Nova tarefa').press('Enter');
  await expect(card.getByRole('button', { name: 'Prazo (opcional)' })).toBeVisible();
  await card.getByLabel('Nova tarefa').fill('Rever textos');
  await card.getByRole('button', { name: 'Prazo (opcional)' }).click();
  await page.getByRole('menuitem', { name: 'Escolher data…' }).click();
  await card.getByLabel('Prazo', { exact: true }).fill(iso(10));
  await card.getByRole('button', { name: 'OK' }).click();
  await expect(card.getByLabel('Prazo', { exact: true })).toHaveCount(0);
  await card.getByLabel('Nova tarefa').press('Enter');
  // "Escolher data…" e fechar sem escolher nada.
  await card.getByRole('button', { name: 'Prazo (opcional)' }).click();
  await page.getByRole('menuitem', { name: 'Escolher data…' }).click();
  await card.getByRole('button', { name: 'Fechar' }).click();
  await expect(card.getByLabel('Prazo', { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; due_on: string | null }[];
      return ['Enviar orçamento', 'Rever textos'].map((t) => tasks.find((x) => x.title === t)?.due_on);
    })
    .toEqual([iso(1), iso(10)]);

  // Apagar.
  await card.getByRole('button', { name: 'Apagar: Publicar site' }).click();
  await expect(page.getByText('Tarefa apagada.')).toBeVisible();
  await expect(pending).toHaveCount(6);
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
  const week = page.getByRole('region', { name: 'Tarefas nos próximos 7 dias' });
  // Cada grupo mostra 5 e "Mostrar todos (N)": com muitas tarefas, a nova pode estar recolhida.
  for (const group of [urgent, week]) {
    await expect(group.getByRole('checkbox').first()).toBeVisible();
    const more = group.getByRole('button', { name: /^Mostrar todos/ });
    if (await more.count()) await more.click();
  }
  await expect(urgent.getByText(`Ligar ao cliente ${run}`)).toBeVisible();
  await expect(week.getByText(`Entregar logótipo ${run}`)).toBeVisible();

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

test('lembretes: marcar no cartão, aviso na plataforma e envio pelo cron', async ({ page, request }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Lembrete ${run}` } })).json()).data;
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');

  // Lembrete para daqui a umas horas pelo sino: a tarefa fica com a etiqueta e o prazo nesse dia.
  await card.getByLabel('Nova tarefa').fill(`Ligar ao cliente ${run}`);
  await card.getByRole('button', { name: 'Lembrete com notificação' }).click();
  // Hora de Lisboa (o browser dos testes está em Europe/Lisbon), daqui a 3 horas.
  const local = new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon', hour12: false })
    .slice(0, 16)
    .replace(' ', 'T');
  await card.getByLabel('Lembrar em').fill(local);
  await card.getByRole('button', { name: 'Acrescentar' }).click();
  await expect(page.getByText(/Lembrete marcado para/)).toBeVisible();
  await expect(card.getByText('Lembrete:', { exact: false })).toBeAttached();
  const created = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data[0];
  expect(created.remind_at).not.toBeNull();
  expect(created.due_on).not.toBeNull();

  // Um lembrete que já chegou à hora aparece como aviso com a plataforma aberta.
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const res = await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Enviar maquete ${run}`, remind_at: past } });
  expect(res.status()).toBe(201);
  await page.goto('/dashboard');
  await expect(page.getByText(`⏰ Enviar maquete ${run}`)).toBeVisible({ timeout: 30_000 });

  // O cron exige o segredo e envia (marca) os lembretes que chegaram à hora.
  expect((await request.get('/api/v1/cron/reminders')).status()).toBe(401);
  if (process.env.CRON_SECRET) {
    const cron = await request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(cron.status()).toBe(200);
    const ids = (await cron.json()).data.map((r: { task_id: string }) => r.task_id);
    const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data;
    const due = tasks.find((t: { title: string }) => t.title === `Enviar maquete ${run}`);
    expect(ids).toContain(due.id);
    expect(due.reminded_at).not.toBeNull();
    // O de daqui a 3 horas ainda não.
    expect(tasks.find((t: { title: string }) => t.title === `Ligar ao cliente ${run}`).reminded_at).toBeNull();
  }
});

test('editar tarefa: escolher o prazo e o lembrete (dia e hora) no calendário da janela', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Calendário ${run}` } })).json()).data as { id: string };
  const title = `Escolher data ${run}`;
  const task = (await (await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title } })).json()).data as { id: string };
  // Dia 15 do mês seguinte (no mês à vista, para o clique escolher o dia).
  const now = new Date(`${iso(0)}T12:00:00Z`);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15));
  const day = next.toISOString().slice(0, 10);
  const label = `15 de ${new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' }).format(next)} de ${next.getUTCFullYear()}`;

  await page.goto(`/leads/${lead.id}`);
  await page.getByText(title, { exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar tarefa' });

  // Prazo: o calendário abre por cima da janela e o clique no dia conta.
  await edit.getByRole('button', { name: 'Abrir calendário' }).first().click();
  await page.getByRole('button', { name: 'Mês seguinte' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(edit.getByLabel('Prazo da tarefa')).toHaveValue(`15/${day.slice(5, 7)}/${day.slice(0, 4)}`);

  // Lembrete: dia e hora.
  await edit.getByRole('button', { name: 'Abrir calendário' }).nth(1).click();
  await page.getByRole('button', { name: 'Mês seguinte' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  // Setas: horas de 1 em 1, minutos de 15 em 15 (09:00 → 11:15).
  await page.getByRole('button', { name: 'Mais horas' }).click();
  await page.getByRole('button', { name: 'Mais horas' }).click();
  await page.getByRole('button', { name: 'Mais minutos' }).click();
  await expect(page.getByLabel('Horas', { exact: true })).toHaveValue('11');
  await expect(edit.getByLabel('Lembrete (dia e hora)')).toHaveValue(new RegExp(`^15/${day.slice(5, 7)}/${day.slice(0, 4)},? 11:15$`));
  await page.getByRole('group', { name: 'Horas habituais' }).getByRole('button', { name: '15:00' }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(edit.getByLabel('Lembrete (dia e hora)')).toHaveValue(new RegExp(`^15/${day.slice(5, 7)}/${day.slice(0, 4)},? 15:00$`));

  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(edit).toHaveCount(0);
  await expect
    .poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string | null }[]).find((t) => t.id === task.id)?.due_on)
    .toBe(day);
});

test('arrastar uma tarefa curta por cima de uma comprida: não estica nem deforma', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Arrastar ${run}` } })).json()).data;
  const long = 'lorem ipsum dolor sit amet consectetuer adipiscing elit. maecenas porttitor congue massa '.repeat(2).trim();
  for (const title of [long, 'Tarefa 2', 'Tarefa 3']) {
    expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title } })).status()).toBe(201);
  }
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');
  const handle = card.getByRole('button', { name: 'Mover a tarefa: Tarefa 3' });
  const target = card.getByRole('button', { name: `Mover a tarefa: ${long}` });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  // Mesmo puxando para o lado, a tarefa só sobe e desce.
  await page.mouse.move(to.x + to.width / 2 + 60, to.y + 5, { steps: 15 });
  await page.waitForTimeout(300);
  // Durante o arrasto, a tarefa só se desloca (sem scale).
  const transform = await handle.evaluate((el) => (el.closest('li') as HTMLElement).style.transform, undefined, { timeout: 5000 });
  expect(transform).toMatch(/translate/);
  expect(transform).not.toMatch(/scale/);
  expect(transform).toMatch(/^translate3d\(0px,/);
  await page.mouse.up();
});

test('copiar o texto da tarefa (no lugar do lápis; editar = tocar no texto)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Copiar ${run}` } })).json()).data;
  const title = `Enviar orçamento ao cliente ${run}`;
  expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title } })).status()).toBe(201);
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');
  const row = card.getByRole('listitem').filter({ hasText: title });
  await row.hover();
  // Ícones à vista: Copiar o texto, Duplicar, Apagar (editar = tocar no texto; o lápis só aparece com o Tab).
  const visible = await row.getByRole('button').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetWidth > 1 && e.getAttribute('aria-label')).map((e) => e.getAttribute('aria-label')!.split(':')[0]),
  );
  expect(visible.filter((l) => ['Editar', 'Copiar o texto', 'Duplicar', 'Apagar'].includes(l))).toEqual(['Copiar o texto', 'Duplicar', 'Apagar']);
  // Com o teclado, o lápis aparece ao chegar lá (Tab) e abre a edição.
  const pencil = row.getByRole('button', { name: `Editar: ${title}` });
  await pencil.focus();
  await expect.poll(() => pencil.evaluate((e) => (e as HTMLElement).offsetWidth)).toBeGreaterThan(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Editar tarefa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await row.hover();
  await row.getByRole('button', { name: `Copiar o texto: ${title}` }).click();
  await expect(page.getByText('Texto copiado.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(title);
});

test('concluir uma tarefa: o visto e o risco veem-se antes de passar para Concluídas, com Anular', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Concluir ${run}` } })).json()).data;
  for (const title of ['Primeira', 'Segunda']) {
    expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title } })).status()).toBe(201);
  }
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#tarefas');
  const box = card.getByRole('checkbox', { name: 'Concluir: Segunda' });
  await box.click();
  // Logo a seguir ao clique: marcada, ainda na lista por fazer.
  await expect(box).toBeChecked();
  await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByText('Segunda')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(page.getByText('Concluída: Segunda')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByText('Segunda')).toHaveCount(0);
  // Anular: volta para as por fazer.
  await page.getByRole('button', { name: 'Anular' }).click();
  await expect(card.getByRole('list', { name: 'Tarefas por fazer' }).getByText('Segunda')).toBeVisible();
});
