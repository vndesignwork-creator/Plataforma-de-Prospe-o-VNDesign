import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { expect, request as playwrightRequest, test } from '@playwright/test';

/*
 * Erros do ecrã no Estado da plataforma, Registo de alterações, Contactos a corrigir,
 * Dashboard num só pedido e Repor a partir de uma cópia.
 */
const run = Date.now().toString(36);

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

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
  for (const key of ['dashboard', 'today', 'period', 'goals', 'replies']) expect(bundle).toHaveProperty(key);
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

test('Ao abrir: o que todas as páginas pedem vem num só pedido; Estatísticas num só pedido', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/v1/')) asked.push(u.pathname);
  });
  await page.goto('/estatisticas');
  await expect(page.getByRole('heading', { name: 'Estatísticas', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(asked).toContain('/api/v1/app/bootstrap');
  expect(asked).toContain('/api/v1/stats/bundle');
  for (const path of ['/api/v1/me', '/api/v1/settings', '/api/v1/services', '/api/v1/sectors', '/api/v1/team/names', '/api/v1/stats/compare', '/api/v1/stats/funnel', '/api/v1/dashboard/origins', '/api/v1/stats/lost-reasons']) {
    expect(asked, path).not.toContain(path);
  }
  // Os dados aparecem (vindos do pedido único).
  await expect(page.getByRole('table', { name: 'Leads por origem' })).toBeVisible();
});

test('Arrumar formatos: telefones como +351 912 345 678 e emails em minúsculas, com Anular', async ({ page }) => {
  const phone = `91${String(Date.now()).slice(-7)}`;
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Formato ${run}`, phone } })).json()).data as { id: string; number: number };
  try {
    const changes = (await (await page.request.get('/api/v1/leads/contact-format')).json()).data as { id: string; field: string; to: string }[];
    const pretty = `+351 ${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
    expect(changes.find((c) => c.id === lead.id && c.field === 'phone')?.to).toBe(pretty);
    await page.goto('/leads/contactos');
    await page.getByRole('button', { name: 'Ver o que muda' }).click();
    await expect(page.getByRole('list', { name: 'O que muda' }).getByText(`#${lead.number} Formato ${run}`)).toBeVisible();
    await page.getByRole('button', { name: 'Arrumar formatos' }).click();
    await expect(page.getByText(/Arrumados os contactos de \d+ leads?\./)).toBeVisible();
    expect(((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { phone: string }).phone).toBe(pretty);
    await page.getByRole('button', { name: 'Anular' }).click();
    await expect.poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { phone: string }).phone).toBe(phone);
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});

test('Cópias guardadas: fazer uma agora e repor a partir dela (sem ficheiros)', async ({ page }) => {
  const name = `Guardada ${run}`;
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: name } })).json()).data as { id: string; number: number };
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Tarefa guardada ${run}` } });
  await page.goto('/definicoes/repor');
  await page.getByRole('button', { name: 'Fazer uma cópia agora' }).click();
  await expect(page.getByText(/^Cópia feita: \d+ leads e \d+ tarefas\.$/)).toBeVisible();
  const copies = page.getByRole('list', { name: 'Cópias guardadas na plataforma' });
  await expect(copies.getByRole('listitem').first()).toBeVisible();

  // Apagado de vez: a cópia guardada repõe-no (com a tarefa).
  await page.request.delete(`/api/v1/leads/${lead.id}`);
  const trash = (await (await page.request.get('/api/v1/leads/trash')).json()).data as { id: string; number: number }[];
  await page.request.delete('/api/v1/leads/trash', { data: { ids: [trash.find((t) => t.number === lead.number)!.id] } });
  await copies.getByRole('button', { name: 'Ver o que falta' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: `#${lead.number} ${name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Repor o que falta' }).click();
  await expect(page.getByText(/^Pronto: 1 lead reposto e \d+ tarefas? reposta/)).toBeVisible();
  const back = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(name)}`)).json()).data as { id: string; number: number }[];
  expect(back[0]?.number).toBe(lead.number);
  const tasks = (await (await page.request.get(`/api/v1/leads/${back[0]!.id}/tasks`)).json()).data as { title: string }[];
  expect(tasks.map((t) => t.title)).toContain(`Tarefa guardada ${run}`);
  await page.request.delete(`/api/v1/leads/${back[0]!.id}`);
});

test('Consumo da IA e créditos: um saldo por fornecedor (Claude e ChatGPT), gasto do mês e o que resta', async ({ page }) => {
  const supabase = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY');
  const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` } });
  const me = (await (await page.request.get('/api/v1/me')).json()).data as { user: { id: string }; workspace: { id: string } };
  type Summary = { total_usd: number; credits: { kind: string; remaining_usd: number | null; console_url: string | null }[]; by_feature: { label: string; cost_usd: number }[] };
  const summary = async () => (await (await page.request.get('/api/v1/ai/usage')).json()).data as Summary;
  try {
    // Claude: 5 $; ChatGPT: 10 $ (contas separadas).
    expect((await page.request.put('/api/v1/ai/credit', { data: { provider: 'anthropic', amount_usd: 5, alert_below_usd: 2, reset: true } })).status()).toBe(200);
    expect((await page.request.put('/api/v1/ai/credit', { data: { provider: 'openai', amount_usd: 10, reset: true } })).status()).toBe(200);
    const before = await summary();
    // Pedidos registados (como os da IA): 1,25 $ e 2,50 $ no Claude, 0,40 $ no ChatGPT.
    const rows = [
      { feature: 'email', cost_usd: 1.25, provider_kind: 'anthropic', model: 'claude-opus-5-5' },
      { feature: 'empresas', cost_usd: 2.5, provider_kind: 'anthropic', model: 'claude-opus-5-5' },
      { feature: 'resumo_lead', cost_usd: 0.4, provider_kind: 'openai', model: 'gpt-5-mini' },
    ].map((r) => ({ ...r, workspace_id: me.workspace.id, user_id: me.user.id, input_tokens: 1000, output_tokens: 100 }));
    expect((await admin.post(`${supabase}/rest/v1/ai_usage`, { data: rows })).status()).toBe(201);
    const after = await summary();
    expect(after.total_usd - before.total_usd).toBeCloseTo(4.15, 4);
    const claude = after.credits.find((c) => c.kind === 'anthropic')!;
    const openai = after.credits.find((c) => c.kind === 'openai')!;
    expect(claude.remaining_usd).toBeCloseTo(1.25, 4);
    expect(openai.remaining_usd).toBeCloseTo(9.6, 4);
    expect(openai.console_url).toContain('platform.openai.com');
    expect(after.by_feature.find((f) => f.label === 'Gerador de leads')?.cost_usd).toBeGreaterThanOrEqual(2.5);

    await page.goto('/definicoes/ia');
    await expect(page.getByRole('heading', { name: 'Consumo e créditos' })).toBeVisible();
    await expect(page.getByTestId('ai-remaining-anthropic')).toHaveText('≈ 1,25 $');
    await expect(page.getByTestId('ai-remaining-openai')).toHaveText('≈ 9,60 $');
    const chatgpt = page.getByRole('listitem', { name: 'Créditos de ChatGPT (OpenAI)' });
    await expect(chatgpt.getByRole('link', { name: /Saldo exato na consola/ })).toHaveAttribute('href', /platform\.openai\.com/);
    await expect(page.getByRole('table', { name: 'Em quê' }).getByRole('rowheader', { name: 'Gerador de leads' })).toBeVisible();

    // Novo carregamento no ChatGPT, no ecrã: conta a partir de agora (o do Claude não mexe).
    await chatgpt.getByRole('button', { name: 'Atualizar o saldo de ChatGPT (OpenAI)' }).click();
    await chatgpt.getByLabel('Saldo de ChatGPT (OpenAI) em dólares').fill('20');
    await chatgpt.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('ChatGPT (OpenAI): 20,00 $ a contar de agora.')).toBeVisible();
    await expect(page.getByTestId('ai-remaining-openai')).toHaveText('≈ 20,00 $');
    await expect(page.getByTestId('ai-remaining-anthropic')).toHaveText('≈ 1,25 $');
  } finally {
    for (const provider of ['anthropic', 'openai']) await page.request.put('/api/v1/ai/credit', { data: { provider, amount_usd: null, alert_below_usd: null } });
    await admin.delete(`${supabase}/rest/v1/ai_usage?workspace_id=eq.${me.workspace.id}&input_tokens=eq.1000&output_tokens=eq.100`);
    await admin.dispose();
  }
});
