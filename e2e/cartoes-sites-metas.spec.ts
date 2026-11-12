import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

const run = Date.now().toString(36);

async function me(page: Page) {
  return (await (await page.request.get('/api/v1/me')).json()).data as { user: { id: string } };
}

test('Cartões: cor, afixar, arquivar e desarquivar (de cada pessoa) e partilhar pela API', async ({ page }) => {
  const res = await page.request.post('/api/v1/task-lists', { data: { title: `Keep ${run}`, items: [`Item ${run}`] } });
  expect(res.status()).toBe(201);
  const list = (await res.json()).data as { id: string; shared: boolean; created_by: string };
  expect(list.shared).toBe(false);
  expect(list.created_by).toBe((await me(page)).user.id);
  await page.goto('/tarefas?vista=cartoes');
  const card = page.getByRole('region', { name: `Keep ${run}` });
  await expect(card.getByText(`Item ${run}`)).toBeVisible();

  // Cor (pelo ⋯ do cartão).
  await card.getByRole('button', { name: `Mais ações: Keep ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Cor: Verde' }).click();
  await expect(card).toHaveAttribute('data-color', 'green');

  // Afixar: passa para "Afixados" (em cima) e fica depois de recarregar.
  await card.getByRole('button', { name: `Mais ações: Keep ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Afixar no topo' }).click();
  const pinned = page.getByRole('group', { name: 'Afixados' });
  await expect(pinned.getByRole('region', { name: `Keep ${run}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Afixados' }).getByRole('region', { name: `Keep ${run}` })).toHaveAttribute('data-color', 'green');

  // Arquivar: sai do quadro e fica em "Arquivados"; Desarquivar volta.
  await page.getByRole('button', { name: `Mais ações: Keep ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Arquivar' }).click();
  await expect(page.getByText(`Lista “Keep ${run}” arquivada.`)).toBeVisible();
  await expect(page.getByRole('region', { name: `Keep ${run}` })).toHaveCount(0);
  const archived = (await (await page.request.get('/api/v1/task-lists?archived=1')).json()).data as { id: string; tasks: { title: string }[] }[];
  expect(archived.find((l) => l.id === list.id)?.tasks.map((t) => t.title)).toEqual([`Item ${run}`]);
  // As tarefas das arquivadas não aparecem nas listas de tarefas.
  const open = (await (await page.request.get('/api/v1/tasks?assigned=all&lists=all')).json()).data as { list_id: string | null }[];
  expect(open.some((t) => t.list_id === list.id)).toBe(false);
  await page.getByRole('button', { name: /^Arquivados/ }).click();
  const archivedCard = page.getByRole('region', { name: `Keep ${run}` });
  await expect(archivedCard.getByText(`Item ${run}`)).toBeVisible();
  await expect(archivedCard.getByLabel(`Nova tarefa em Keep ${run}`)).toHaveCount(0);
  await archivedCard.getByRole('button', { name: `Mais ações: Keep ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Desarquivar' }).click();
  await expect(page.getByText(`Lista “Keep ${run}” de volta ao quadro.`)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Afixados' }).getByRole('region', { name: `Keep ${run}` })).toBeVisible();

  // Partilhar com a equipa (o botão só aparece com equipa; aqui pela API).
  const shared = await page.request.patch(`/api/v1/task-lists/${list.id}`, { data: { shared: true } });
  expect((await shared.json()).data.shared).toBe(true);

  // Desafixar e limpar.
  await page.getByRole('button', { name: `Mais ações: Keep ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Desafixar' }).click();
  await expect(page.getByRole('group', { name: 'Afixados' })).toHaveCount(0);
  expect((await page.request.delete(`/api/v1/task-lists/${list.id}`)).status()).toBe(204);
});

test('Cartão de um lead: arquivar tira-o do quadro; desarquivar repõe; uma tarefa nova trá-lo de volta', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Arquivo Lead ${run}` } })).json()).data as { id: string; number: number };
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Ligar ${run}` } });
  const name = `#${lead.number} Arquivo Lead ${run}`;
  await page.goto('/tarefas?vista=cartoes');
  const card = page.getByRole('region', { name });
  await expect(card.getByText(`Ligar ${run}`)).toBeVisible();

  await card.getByRole('button', { name: `Mais ações: ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Arquivar' }).click();
  await expect(page.getByText(`“${name}” arquivado.`)).toBeVisible();
  await expect(page.getByRole('region', { name })).toHaveCount(0);
  // Fica arquivado depois de recarregar (preferência guardada) e aparece em "Arquivados".
  await page.reload();
  await expect(page.getByText(`Ligar ${run}`)).toHaveCount(0);
  await page.getByRole('button', { name: /^Arquivados/ }).click();
  const archived = page.getByRole('region', { name });
  await expect(archived.getByText(`Ligar ${run}`)).toBeVisible();
  await archived.getByRole('button', { name: `Mais ações: ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Desarquivar' }).click();
  await expect(page.getByText(`“${name}” de volta ao quadro.`)).toBeVisible();
  await expect(page.getByRole('region', { name }).getByLabel(`Nova tarefa em ${name}`)).toBeVisible();

  // Arquivado de novo, uma tarefa nova no lead trá-lo de volta ao quadro.
  await page.getByRole('region', { name }).getByRole('button', { name: `Mais ações: ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Arquivar' }).click();
  await expect(page.getByText(`“${name}” arquivado.`)).toBeVisible();
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Enviar proposta ${run}` } });
  await page.reload();
  await expect(page.getByRole('region', { name }).getByLabel(`Nova tarefa em ${name}`)).toBeVisible();
  await expect(page.getByRole('region', { name }).getByText(`Enviar proposta ${run}`)).toBeVisible();
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});

test('Cartões: atrasadas (número e filtro), recolher, Mover ▸ e pesquisa nos arquivados', async ({ page }) => {
  test.setTimeout(120_000);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const mk = async (company: string) => (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: company } })).json()).data as { id: string; number: number };
  const late = await mk(`Atrasado ${run}`);
  const calm = await mk(`Em dia ${run}`);
  await page.request.post(`/api/v1/leads/${late.id}/tasks`, { data: { title: `Ligar ontem ${run}`, due_on: yesterday } });
  await page.request.post(`/api/v1/leads/${calm.id}/tasks`, { data: { title: `Sem pressa ${run}` } });
  const lateName = `#${late.number} Atrasado ${run}`;
  const calmName = `#${calm.number} Em dia ${run}`;
  await page.goto('/tarefas?vista=cartoes');
  const lateCard = page.getByRole('region', { name: lateName });
  await expect(lateCard.getByLabel('1 em atraso')).toBeVisible();
  await expect(page.getByRole('region', { name: calmName }).getByLabel(/em atraso/)).toHaveCount(0);

  // Só com atrasadas.
  await page.getByRole('button', { name: /^Só com atrasadas/ }).click();
  await expect(lateCard).toBeVisible();
  await expect(page.getByRole('region', { name: calmName })).toHaveCount(0);
  await page.getByRole('button', { name: /^Só com atrasadas/ }).click();
  await expect(page.getByRole('region', { name: calmName })).toBeVisible();

  // Recolher: só o título e os números; fica assim depois de recarregar.
  await lateCard.getByRole('button', { name: `Recolher o cartão: ${lateName}` }).click();
  await expect(lateCard.getByText(`Ligar ontem ${run}`)).toHaveCount(0);
  await expect(lateCard.getByText('1 por fazer')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: lateName }).getByText(`Ligar ontem ${run}`)).toHaveCount(0);
  await page.getByRole('button', { name: `Abrir o cartão: ${lateName}` }).click();
  await expect(page.getByRole('region', { name: lateName }).getByText(`Ligar ontem ${run}`)).toBeVisible();

  // Mover ▸ Para o início.
  await page.getByRole('region', { name: calmName }).getByRole('button', { name: `Mais ações: ${calmName}` }).click();
  await page.getByRole('menuitem', { name: 'Mover' }).click();
  await page.getByRole('menuitem', { name: 'Para o início' }).click();
  await expect.poll(async () => {
    const names = await page.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    return names.indexOf(calmName) < names.indexOf(lateName);
  }).toBe(true);

  // Pesquisa: encontra também o cartão arquivado (com "Arquivado").
  await page.getByRole('region', { name: calmName }).getByRole('button', { name: `Mais ações: ${calmName}` }).click();
  await page.getByRole('menuitem', { name: 'Arquivar' }).click();
  await expect(page.getByText(`“${calmName}” arquivado.`)).toBeVisible();
  await page.getByLabel('Procurar tarefa ou lead').fill(`Sem pressa ${run}`);
  const found = page.getByRole('region', { name: calmName });
  await expect(found.getByText('Arquivado', { exact: true })).toBeVisible();
  await expect(found.getByText(`Sem pressa ${run}`)).toBeVisible();
  await page.request.delete(`/api/v1/leads/${late.id}`);
  await page.request.delete(`/api/v1/leads/${calm.id}`);
});

test('Sem interesse: as tarefas por fazer do lead concluem-se (ou apagam-se) no mesmo passo', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Desistiu ${run}`, status: 'contactado' } })).json()).data as { id: string };
  for (const title of [`Ligar ${run}`, `Enviar proposta ${run}`]) await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title } });
  await page.goto(`/leads/${lead.id}`);
  await page.getByLabel('Estado', { exact: true }).selectOption('sem_interesse');
  const dialog = page.getByRole('dialog', { name: 'Porque fica “Sem interesse”?' });
  await expect(dialog.getByText('As 2 tarefas por fazer')).toBeVisible();
  await expect(dialog.getByLabel('Concluir')).toBeChecked();
  await dialog.getByLabel('Preço').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('2 tarefas concluídas.')).toBeVisible();
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { done_at: string | null }[];
  expect(tasks).toHaveLength(2);
  expect(tasks.every((t) => t.done_at)).toBe(true);

  // Pela API, também em lote e a apagar.
  const other = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Desistiu B ${run}` } })).json()).data as { id: string };
  await page.request.post(`/api/v1/leads/${other.id}/tasks`, { data: { title: `Apagar ${run}` } });
  const res = await page.request.post('/api/v1/tasks/close-open', { data: { lead_ids: [other.id, lead.id], action: 'delete' } });
  expect((await res.json()).data.count).toBe(1);
  await page.request.delete(`/api/v1/leads/${lead.id}`);
  await page.request.delete(`/api/v1/leads/${other.id}`);
});

test('Tarefas que se repetem: escrever "todas as segundas", concluir cria a seguinte, Anular tira-a; quem marcou', async ({ page }) => {
  const list = (await (await page.request.post('/api/v1/task-lists', { data: { title: `Rotina ${run}` } })).json()).data as { id: string };
  await page.goto('/tarefas?vista=cartoes');
  const card = page.getByRole('region', { name: `Rotina ${run}` });
  const input = card.getByLabel(`Nova tarefa em Rotina ${run}`);
  await input.fill(`Rever leads frios ${run} todas as segundas`);
  await input.press('Enter');
  const row = card.getByRole('listitem').filter({ hasText: `Rever leads frios ${run}` });
  await expect(row).toContainText('Semanal');

  const tasks = async () =>
    ((await (await page.request.get('/api/v1/tasks?assigned=all&lists=all')).json()).data as { id: string; list_id: string | null; due_on: string; repeat: string | null }[]).filter(
      (t) => t.list_id === list.id,
    );
  const [first] = await tasks();
  expect(first!.repeat).toBe('weekly');
  // A próxima segunda (ou hoje, se for segunda).
  expect(new Date(`${first!.due_on}T12:00:00Z`).getUTCDay()).toBe(1);

  // Concluir: a seguinte fica para daqui a uma semana; "Anular" tira-a outra vez.
  await row.getByRole('checkbox', { name: `Concluir: Rever leads frios ${run}` }).check();
  await expect(page.getByText(/a próxima fica para/)).toBeVisible();
  await expect.poll(async () => (await tasks()).length).toBe(1);
  const [next] = await tasks();
  expect(next!.id).not.toBe(first!.id);
  const nextDue = new Date(`${first!.due_on}T12:00:00Z`);
  nextDue.setUTCDate(nextDue.getUTCDate() + 7);
  expect(next!.due_on).toBe(nextDue.toISOString().slice(0, 10));
  const done = ((await (await page.request.get('/api/v1/tasks?assigned=all&lists=all&state=done')).json()).data as { id: string; done_by: string | null; next_task_id: string | null }[]).find(
    (t) => t.id === first!.id,
  );
  expect(done?.done_by).toBe((await me(page)).user.id);
  expect(done?.next_task_id).toBe(next!.id);

  const undo = await page.request.patch(`/api/v1/tasks/${first!.id}`, { data: { done: false } });
  expect(undo.status()).toBe(200);
  const after = await tasks();
  expect(after.map((t) => t.id)).toEqual([first!.id]);

  // Mudar a repetição na janela de editar.
  await page.reload();
  await page.getByRole('region', { name: `Rotina ${run}` }).getByText(`Rever leads frios ${run}`).click();
  const dialog = page.getByRole('dialog', { name: 'Editar tarefa' });
  await dialog.getByLabel('Repetir').selectOption('monthly');
  await expect(dialog.getByText(/Ao concluir, a próxima fica para/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('region', { name: `Rotina ${run}` }).getByRole('listitem').filter({ hasText: `Rever leads frios ${run}` })).toContainText('Mensal');
  expect((await page.request.delete(`/api/v1/task-lists/${list.id}`)).status()).toBe(204);
});

test('Site do cliente: vigiar, no ar, 2 falhas = em baixo, data do domínio à mão e Dashboard', async ({ page }) => {
  // Um "site" local (em desenvolvimento os endereços locais podem ser vigiados).
  let up = true;
  const server = http.createServer((_req, res) => {
    res.writeHead(up ? 200 : 503, { 'content-type': 'text/html' });
    res.end('<html><body>Olá</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Site ${run}`, status: 'cliente' } })).json()).data as { id: string; number: number };
    await page.goto(`/leads/${lead.id}`);
    await page.getByRole('tab', { name: /Cliente/ }).click();
    const section = page.getByRole('region', { name: 'Site do cliente' });
    await section.getByRole('button', { name: 'Vigiar o site' }).click();
    await section.getByLabel('Endereço do site a vigiar').fill(url);
    await section.getByRole('button', { name: 'Começar a vigiar' }).click();
    await expect(page.getByText('A vigiar o site: avisa se for abaixo ou antes de expirar.')).toBeVisible();
    await expect(section.getByText('No ar', { exact: true })).toBeVisible();

    // Data do domínio à mão (a 10 dias): aviso "Domínio expira em 10 dias".
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const monitor = (await (await page.request.get(`/api/v1/leads/${lead.id}/site-monitor`)).json()).data as { id: string };
    expect((await page.request.patch(`/api/v1/site-monitors/${monitor.id}`, { data: { domain_expires_on: soon } })).status()).toBe(200);
    await page.reload();
    await page.getByRole('tab', { name: /Cliente/ }).click();
    await expect(page.getByRole('region', { name: 'Site do cliente' }).getByText('Domínio expira em 10 dias')).toBeVisible();

    // O site vai abaixo: uma falha ainda não conta; a segunda já.
    up = false;
    await page.getByRole('region', { name: 'Site do cliente' }).getByRole('button', { name: 'Verificar agora' }).click();
    await expect(page.getByText(/Não respondeu: O site respondeu com o erro 503/)).toBeVisible();
    let m = (await (await page.request.post(`/api/v1/site-monitors/${monitor.id}/check`)).json()).data as { down_since: string | null; fail_count: number; is_up: boolean };
    expect(m.fail_count).toBe(2);
    expect(m.down_since).not.toBeNull();
    expect(m.is_up).toBe(false);

    // Dashboard: o cartão "Sites vigiados" mostra o problema (e diz que é um cliente).
    await page.goto('/');
    const sites = page.getByRole('heading', { name: 'Sites vigiados' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(sites.getByText(`#${lead.number} Site ${run}`)).toBeVisible();
    // Só na linha deste lead (pode haver outros sites em baixo de outros testes).
    const row = sites.getByRole('listitem').filter({ hasText: `#${lead.number} Site ${run}` });
    await expect(row.getByText(/Em baixo/)).toBeVisible();
    await expect(row.getByText('Cliente', { exact: true })).toBeVisible();
    // "Falso alarme" na própria linha: o aviso de "em baixo" sai (o domínio a expirar continua).
    await row.getByRole('button', { name: `Falso alarme — Site ${run}` }).click();
    await expect(page.getByText(/Aviso retirado/)).toBeVisible();
    await expect(row.getByText(/Em baixo/)).toHaveCount(0);
    await expect(row.getByText('Domínio expira em 10 dias')).toBeVisible();
    // No projeto: diz até quando, e "Voltar a avisar".
    await page.goto(`/leads/${lead.id}`);
    await page.getByRole('tab', { name: /Cliente/ }).click();
    const siteRegion = page.getByRole('region', { name: 'Site do cliente' });
    await expect(siteRegion.getByText(/Falso alarme: sem avisos de “em baixo” até/)).toBeVisible();
    await siteRegion.getByRole('button', { name: 'Voltar a avisar' }).click();
    await expect(siteRegion.getByText(/Falso alarme: sem avisos/)).toHaveCount(0);

    // Volta ao ar.
    up = true;
    m = (await (await page.request.post(`/api/v1/site-monitors/${monitor.id}/check`)).json()).data;
    expect(m.down_since).toBeNull();
    expect(m.is_up).toBe(true);
    expect((await page.request.delete(`/api/v1/site-monitors/${monitor.id}`)).status()).toBe(204);
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  } finally {
    server.close();
  }
});

test('Metas do mês no Dashboard: definir, barras com o ritmo e chamadas contadas pela prospeção', async ({ page }) => {
  await page.request.patch('/api/v1/settings', { data: { goals: {} } });
  const before = (await (await page.request.get('/api/v1/goals')).json()).data as { team: { calls: number; whatsapp: number } };
  await page.goto('/');
  await page.getByRole('button', { name: 'Definir metas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Metas do mês' });
  await dialog.getByLabel('Recebido (€)').fill('3000');
  await dialog.getByLabel('Chamadas').fill('200');
  await dialog.getByLabel('WhatsApp enviados').fill('80');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Metas do mês guardadas.')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /^Recebido: .* de 3000 €$/ })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: new RegExp(`^Chamadas: ${before.team.calls} de 200$`) })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mudar metas' })).toBeVisible();

  // A prospeção conta: "Contactado" depois de "WhatsApp" = 1 WhatsApp; "Não atendeu" = 1 chamada.
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Metas ${run}`, phone: '912345678' } })).json()).data as { id: string };
  expect((await page.request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'contacted', channel: 'whatsapp' } })).status()).toBe(200);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'no_answer' } })).status()).toBe(200);
  const after = (await (await page.request.get('/api/v1/goals')).json()).data as { team: { calls: number; whatsapp: number }; mine: { calls: number } };
  expect(after.team.whatsapp).toBe(before.team.whatsapp + 1);
  expect(after.team.calls).toBe(before.team.calls + 1);
  // Registar a mesma chamada outra vez no mesmo dia não conta duas vezes.
  await page.request.post(`/api/v1/leads/${lead.id}/activities`, { data: { type: 'call_logged', body: 'Chamada' } });
  expect(((await (await page.request.get('/api/v1/goals')).json()).data as { team: { calls: number } }).team.calls).toBe(before.team.calls + 1);

  await page.request.patch('/api/v1/settings', { data: { goals: {} } });
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});

test('Sem repetições: reunião marcada não aparece também como próxima ação no calendário; contactos contam uma vez por lead e dia', async ({ page }) => {
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Sem repetir ${run}`, status: 'respondeu', phone: '912345670' } })).json()).data as { id: string };
  const day = new Date(Date.now() + 3 * 86_400_000);
  day.setUTCHours(10, 0, 0, 0);
  expect((await page.request.post(`/api/v1/leads/${lead.id}/meetings`, { data: { starts_at: day.toISOString(), duration_min: 30 } })).status()).toBe(201);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(day);
  const updated = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { next_action_on: string; next_action_text: string };
  expect(updated.next_action_on).toBe(iso);
  const events = (await (await page.request.get(`/api/v1/projects/calendar?from=${iso}&to=${iso}&followups=true`)).json()).data as { type: string; lead: { id: string } }[];
  const mine = events.filter((e) => e.lead.id === lead.id).map((e) => e.type);
  expect(mine).toEqual(['meeting']);

  // Equipa: WhatsApp aberto + "Contactado" na prospeção = 1 contacto (não 2).
  const stats = async () => ((await (await page.request.get('/api/v1/stats/team')).json()).data.members as { contacts_today: number }[])[0]!.contacts_today;
  const before = await stats();
  await page.request.post(`/api/v1/leads/${lead.id}/activities`, { data: { type: 'template_used', payload: { via: 'whatsapp' } } });
  await page.request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'contacted', channel: 'whatsapp' } });
  expect(await stats()).toBe(before + 1);
  await page.request.delete(`/api/v1/leads/${lead.id}`);
});
