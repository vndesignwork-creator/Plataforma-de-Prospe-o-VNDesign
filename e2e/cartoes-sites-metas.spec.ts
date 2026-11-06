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

  // Arquivar: sai do quadro e fica em "Listas arquivadas"; Desarquivar volta.
  await page.getByRole('button', { name: `Mais ações: Keep ${run}` }).click();
  await page.getByRole('menuitem', { name: 'Arquivar' }).click();
  await expect(page.getByText(`Lista “Keep ${run}” arquivada.`)).toBeVisible();
  await expect(page.getByRole('region', { name: `Keep ${run}` })).toHaveCount(0);
  const archived = (await (await page.request.get('/api/v1/task-lists?archived=1')).json()).data as { id: string; tasks: { title: string }[] }[];
  expect(archived.find((l) => l.id === list.id)?.tasks.map((t) => t.title)).toEqual([`Item ${run}`]);
  // As tarefas das arquivadas não aparecem nas listas de tarefas.
  const open = (await (await page.request.get('/api/v1/tasks?assigned=all&lists=all')).json()).data as { list_id: string | null }[];
  expect(open.some((t) => t.list_id === list.id)).toBe(false);
  await page.getByRole('button', { name: /Listas arquivadas/ }).click();
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

    // Dashboard: o cartão "Sites dos clientes" mostra o problema.
    await page.goto('/');
    const sites = page.getByRole('heading', { name: 'Sites dos clientes' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(sites.getByText(`#${lead.number} Site ${run}`)).toBeVisible();
    await expect(sites.getByText(/Em baixo/)).toBeVisible();

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
