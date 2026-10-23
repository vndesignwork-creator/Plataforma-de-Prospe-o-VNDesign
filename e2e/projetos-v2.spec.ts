import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Projetos: prazo e fases, ações rápidas na lista, plano de pagamentos, horas,
 * revisões, entregas, página para o cliente, calendário e os passos finais ao
 * concluir (portefólio, novo serviço, pedido de avaliação).
 */
const run = Date.now().toString(36);
const iso = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(Date.now() + days * 86_400_000));

async function createClient(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data: { status: 'cliente', ...data } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number };
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.request.post('/api/v1/time/stop');
  await page.request.patch('/api/v1/settings', {
    data: { google_review_url: '', features: { projects: true, payments: true, meetings: true, revisions: true, time_tracking: true, deliverables: true, client_page: true } },
  });
  await page.close();
});

test('lista: prazo, fase, ações rápidas, plano de pagamentos, temporizador, fases e calendário', async ({ page }) => {
  test.setTimeout(90_000);
  const name = `Atelier Prazo ${run}`;
  const lead = await createClient(page.request, { company_name: name, phone: '912 345 678', estimated_value: 800 });
  const due = iso(5);
  const patch = await page.request.patch(`/api/v1/leads/${lead.id}/project`, { data: { due_on: due, stage: 'producao' } });
  expect(patch.status(), await patch.text()).toBe(200);
  expect((await patch.json()).data).toMatchObject({ due_on: due, stage: 'producao', revisions_included: 2, share_token: null });
  for (const title of ['Briefing com o cliente', 'Primeira proposta de logótipo']) {
    expect((await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title } })).status()).toBe(201);
  }

  await page.goto('/projetos');
  await page.getByRole('button', { name: 'Lista' }).click();
  const row = page.getByRole('list', { name: 'Projetos em curso' }).getByRole('listitem').filter({ hasText: name }).first();
  await expect(row.getByText('Faltam 5 dias')).toBeVisible();
  await expect(row.getByRole('button', { name: /Fase do projeto: Em produção/ })).toBeVisible();
  await expect(row.getByRole('progressbar', { name: /Tarefas de .*: 0 de 2/ })).toBeVisible();

  // Todas as tarefas na lista: marcar, acrescentar e mudar a ordem (teclado na pega).
  const list = row.getByRole('list', { name: 'Tarefas por fazer' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await list.getByRole('checkbox', { name: 'Concluir: Briefing com o cliente' }).click();
  await expect(row.getByRole('progressbar', { name: /Tarefas de .*: 1 de 2/ })).toBeVisible();
  await row.getByRole('textbox', { name: 'Nova tarefa' }).fill('Enviar ficheiros finais');
  await row.getByRole('button', { name: 'Acrescentar' }).click();
  await expect(row.getByRole('progressbar', { name: /Tarefas de .*: 1 de 3/ })).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const handle = list.getByRole('button', { name: 'Mover a tarefa: Enviar ficheiros finais' });
  await handle.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => {
      const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; done_at: string | null; position: number }[];
      return tasks.filter((t) => !t.done_at).sort((a, b) => a.position - b.position).map((t) => t.title);
    })
    .toEqual(['Enviar ficheiros finais', 'Primeira proposta de logótipo']);
  await row.getByRole('button', { name: 'Esconder tarefas' }).click();
  await expect(row.getByRole('list', { name: 'Tarefas por fazer' })).toHaveCount(0);
  await row.getByRole('button', { name: 'Mostrar tarefas' }).click();

  // Sem pagamentos: criar o plano sem sair da página.
  await row.getByRole('button', { name: 'Criar plano' }).click();
  const planDialog = page.getByRole('dialog', { name: 'Plano de pagamentos' });
  await expect(planDialog.getByLabel('Total (€)')).toHaveValue('800');
  await planDialog.getByRole('button', { name: 'Criar plano' }).click();
  const summary = row.getByRole('group', { name: `Resumo de ${name}` });
  await expect(summary.getByText(/0\s€ de 800\s€/)).toBeVisible();
  await expect(summary.getByRole('progressbar', { name: /Recebido de .*: 0\s€ de 800\s€/ })).toBeVisible();
  // O cronómetro e o Pomodoro ficam juntos no bloco "Tempo".
  await expect(row.getByRole('group', { name: 'Tempo' }).getByRole('button', { name: 'Começar a contar o tempo' })).toBeVisible();

  // Temporizador: começar, pausar (o total fica) e continuar a somar.
  await row.getByRole('button', { name: 'Começar a contar o tempo' }).click();
  await expect(page.getByRole('status', { name: new RegExp(`Temporizador a contar: ${name}`) }).first()).toBeVisible();
  // (Registos com menos de 5 s não ficam guardados.)
  await page.waitForTimeout(5500);
  await row.getByRole('button', { name: /Pausar o temporizador/ }).click();
  await expect(page.getByText(/Em pausa\. Total registado: \d+ s\./)).toBeVisible();
  await expect(page.getByRole('status', { name: /Temporizador a contar/ })).toHaveCount(0);
  const resume = row.getByRole('button', { name: /Continuar a contar o tempo \(total 0:00:0[2-9]\)/ });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByText('A continuar a contar.')).toBeVisible();
  await expect(row.getByRole('button', { name: /Pausar o temporizador \(total 0:00:0[2-9]\)/ })).toBeVisible();
  await page.waitForTimeout(5500);
  await row.getByRole('button', { name: /Pausar o temporizador/ }).click();
  await expect(row.getByRole('button', { name: /Continuar a contar o tempo/ })).toBeVisible();
  const time = (await (await page.request.get(`/api/v1/leads/${lead.id}/time`)).json()).data;
  expect(time.entries).toHaveLength(2);
  expect(time.logged_seconds).toBeGreaterThanOrEqual(10);
  expect(time.running).toBeNull();

  // Fases: o cartão está em "Em produção"; muda para "Revisões" pelo botão da fase.
  await page.getByRole('button', { name: 'Fases' }).click();
  const producao = page.getByRole('list', { name: 'Projetos em Em produção' });
  await expect(producao.getByText(name)).toBeVisible();
  await producao.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: /Fase do projeto/ }).click();
  await page.getByRole('menuitemradio', { name: 'Revisões' }).click();
  await expect(page.getByRole('list', { name: 'Projetos em Revisões' }).getByText(name)).toBeVisible();
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string }[];
  expect(activities.filter((a) => a.type === 'project_stage_changed').length).toBeGreaterThanOrEqual(2);

  // Calendário: a entrega aparece no dia do prazo.
  await page.getByRole('button', { name: 'Calendário' }).click();
  // Num dia com muitos eventos (testes anteriores), "+N mais" mostra o resto.
  const dayCell = page.getByRole('gridcell', {
    name: new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${due}T00:00:00Z`)),
  });
  await expect(dayCell.getByRole('link').first()).toBeVisible();
  const more = dayCell.getByRole('button', { name: /mais$/ });
  if (await more.count()) await more.click();
  await expect(page.getByRole('link', { name: new RegExp(`^Entrega: Entrega — #${lead.number} ${name}`) }).first()).toBeVisible();
  const events = (await (await page.request.get(`/api/v1/projects/calendar?from=${iso(0)}&to=${iso(10)}`)).json()).data as { type: string; date: string; lead: { id: string } }[];
  expect(events.some((e) => e.type === 'due' && e.date === due && e.lead.id === lead.id)).toBe(true);
  expect((await page.request.get('/api/v1/projects/calendar?from=2026-01-01&to=2026-06-01')).status()).toBe(400);
  await page.getByRole('button', { name: 'Lista' }).click();
});

test('ficha: revisões, horas e €/hora, entregas e a página para o cliente', async ({ page, browser }) => {
  const name = `Estúdio Ficha ${run}`;
  const lead = await createClient(page.request, { company_name: name, contact_name: 'Marta', estimated_value: 600 });
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: 'Moodboard' } });
  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#projeto');
  await expect(card.getByRole('heading', { name: 'Projeto' })).toBeVisible();

  // Revisões: 1 incluída; a segunda fica "A cobrar".
  await card.getByLabel('Incluídas no preço').fill('1');
  await card.getByLabel('Incluídas no preço').press('Enter');
  await expect(page.getByText('1 revisão incluída no preço.')).toBeVisible();
  await card.getByRole('button', { name: 'Revisão', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Revisão 1' });
  await expect(dialog.getByLabel('A cobrar à parte')).not.toBeChecked();
  await dialog.getByLabel('O que o cliente pediu').fill('Trocar a cor do logótipo');
  await dialog.getByRole('button', { name: 'Registar' }).click();
  await card.getByRole('button', { name: 'Revisão', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Revisão 2' });
  await expect(dialog.getByText(/Já foram feitas as 1 revisões incluídas/)).toBeVisible();
  await expect(dialog.getByLabel('A cobrar à parte')).toBeChecked();
  await dialog.getByLabel('O que o cliente pediu').fill('Nova versão do cartão de visita');
  await dialog.getByRole('button', { name: 'Registar' }).click();
  const revisions = card.getByRole('list', { name: 'Revisões pedidas' });
  await expect(revisions.getByRole('listitem')).toHaveCount(2);
  await expect(revisions.getByText('A cobrar')).toHaveCount(1);
  await expect(card.getByText('2 de 1 · 1 a cobrar')).toBeVisible();

  // Horas: 2 h à mão → 300 €/hora (valor estimado 600 €).
  await card.getByRole('button', { name: 'À mão' }).click();
  dialog = page.getByRole('dialog', { name: 'Registar horas' });
  await dialog.getByLabel('Horas').fill('2');
  await dialog.getByLabel('O que fizeste (opcional)').fill('Maquete');
  await dialog.getByRole('button', { name: 'Registar' }).click();
  await expect(card.getByText(/2 h registadas · 300\s€\/hora/)).toBeVisible();
  // Corrigir o registo: 3 h → 200 €/hora.
  await card.getByRole('button', { name: /Corrigir o registo de 2 h/ }).click();
  await card.getByRole('spinbutton', { name: 'Horas' }).fill('3');
  await card.getByRole('button', { name: 'Guardar a correção' }).click();
  await expect(page.getByText('Registo corrigido.')).toBeVisible();
  await expect(card.getByText(/3 h registadas · 200\s€\/hora/)).toBeVisible();

  // Entregas: link sem https:// e aprovada pelo cliente.
  await card.getByRole('button', { name: 'Entrega', exact: true }).click();
  await card.getByLabel('Nome da entrega').fill('Logótipo — versão final');
  await card.getByLabel('Link (opcional)').fill('drive.google.com/logo-final');
  await card.getByRole('button', { name: 'Acrescentar' }).click();
  const files = card.getByRole('list', { name: 'Ficheiros e entregas' });
  await expect(files.getByRole('link', { name: /Logótipo — versão final/ })).toHaveAttribute('href', 'https://drive.google.com/logo-final');
  await files.getByLabel('Estado de Logótipo — versão final').selectOption('aprovada');
  await expect(page.getByText('Aprovada: Logótipo — versão final. ✅')).toBeVisible();
  await expect(card.getByText('1 de 1 aprovada')).toBeVisible();

  // Página para o cliente: abre sem sessão; desligada deixa de abrir.
  await card.getByRole('button', { name: 'Criar link' }).click();
  const url = await card.getByLabel('Link da página do cliente').inputValue();
  expect(url).toMatch(/\/p\/[A-Za-z0-9_-]{24}$/);
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const client = await anon.newPage();
  await client.goto(url);
  await expect(client.getByRole('heading', { name: `Projeto ${name}` })).toBeVisible();
  await expect(client.getByText('Olá Marta! Aqui pode acompanhar o andamento do projeto.')).toBeVisible();
  await expect(client.getByText('Fase atual: Briefing.')).toBeVisible();
  await expect(client.getByRole('link', { name: /Logótipo — versão final/ })).toBeVisible();
  await expect(client.getByLabel('Revisões').getByText('2 de 1')).toBeVisible();
  await expect(client.getByText('Moodboard')).toBeVisible();
  // Nada de dados internos (horas, valores estimados).
  await expect(client.getByText(/hora/)).toHaveCount(0);

  await card.getByRole('button', { name: 'Desligar' }).click();
  await page.getByRole('dialog', { name: 'Desligar o link?' }).getByRole('button', { name: 'Desligar' }).click();
  await expect(page.getByText('Link desligado: a página deixou de abrir.')).toBeVisible();
  const gone = await client.goto(url);
  expect(gone?.status()).toBe(404);
  await anon.close();
});

test('concluir: tarefas finais e pedido de avaliação no Google', async ({ page }) => {
  const name = `Loja Avaliação ${run}`;
  const lead = await createClient(page.request, { company_name: name, contact_name: 'Rui', phone: '+351 912 345 678' });
  const review = `https://g.page/r/vnd-${run}/review`;
  expect((await page.request.patch('/api/v1/settings', { data: { google_review_url: review } })).status()).toBe(200);
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>wa</p>' }));

  await page.goto('/projetos');
  await page.getByRole('button', { name: 'Lista' }).click();
  const row = page.getByRole('list', { name: 'Projetos em curso' }).getByRole('listitem').filter({ hasText: name }).first();
  await row.getByRole('button', { name: 'Concluir projeto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Concluir o projeto' });
  await expect(dialog.getByLabel(/Juntar o projeto ao portefólio/)).toBeChecked();
  await dialog.getByLabel('Daqui a quantos meses').selectOption('3');
  await dialog.getByRole('button', { name: 'Concluir projeto' }).click();

  const done = page.getByRole('dialog', { name: 'Projeto concluído 🎉' });
  const wa = done.getByRole('link', { name: 'Pedir por WhatsApp' });
  await expect(wa).toBeVisible();
  const text = new URL((await wa.getAttribute('href'))!).searchParams.get('text')!;
  expect(text).toContain('Olá Rui!');
  expect(text).toContain(review);
  await done.getByRole('button', { name: 'Fechar' }).last().click();

  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; due_on: string }[];
  expect(tasks.find((t) => t.title === 'Juntar o projeto ao portefólio')?.due_on).toBe(iso(7));
  const upsell = tasks.find((t) => t.title.startsWith('Propor um novo serviço'));
  expect(upsell?.due_on.slice(0, 7)).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(new Date().setMonth(new Date().getMonth() + 3))).slice(0, 7));
  expect((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data.project_completed_at).not.toBeNull();
});

test('funcionalidades: desligar as partes do projeto tira-as da ficha', async ({ page }) => {
  const lead = await createClient(page.request, { company_name: `Café Desligar ${run}` });
  await page.request.patch('/api/v1/settings', { data: { features: { revisions: false, time_tracking: false, deliverables: false, client_page: false } } });
  try {
    await page.goto(`/leads/${lead.id}`);
    const card = page.locator('#projeto');
    await expect(card.getByText('Prazo de entrega')).toBeVisible();
    for (const heading of ['Revisões', 'Horas', 'Ficheiros e entregas', 'Página para o cliente']) {
      await expect(card.getByRole('heading', { name: heading })).toHaveCount(0);
    }
  } finally {
    await page.request.patch('/api/v1/settings', { data: { features: { revisions: true, time_tracking: true, deliverables: true, client_page: true } } });
  }
});
