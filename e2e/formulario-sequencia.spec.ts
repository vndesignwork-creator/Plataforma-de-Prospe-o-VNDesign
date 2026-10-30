import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

/*
 * Formulário do site (endereço público → lead, tarefa e nota), sequência
 * multicanal na Prospeção, Equipa → Atividade ("quem fez o quê") e modo foco
 * do Pomodoro.
 */
const run = Date.now().toString(36);
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number; company_name: string };
}

// Os follow-ups automáticos não caem ao fim de semana: sábado e domingo passam para segunda.
const workday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const shift = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 1 : 0;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
};
const addDays = (n: number) => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Ficha do cliente: as partes do projeto estão em separadores (Trabalho e entregas | Tempo e dinheiro | Cliente e equipa). */
async function projectTab(page: import('@playwright/test').Page, name: string) {
  await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

test('formulário do site: cria o lead com tarefa e nota; junta ao mesmo lead; robôs e erros', async ({ page }) => {
  const on = await page.request.post('/api/v1/site-form', { data: { enabled: true } });
  expect(on.status(), await on.text()).toBe(200);
  const token = (await on.json()).data.token as string;
  const anon = await playwrightRequest.newContext({ baseURL: BASE });
  try {
    const email = `pedido-${run}@exemplo.pt`;
    // Formulário HTML normal (como o do site): responde com a página "Obrigado".
    const html = await anon.post(`/api/v1/public/forms/${token}`, {
      form: { nome: 'Rita Pedido', email, telefone: '912 000 333', empresa: `Pastelaria Pedido ${run}`, mensagem: 'Gostava de um site para a pastelaria.' },
    });
    expect(html.status()).toBe(200);
    expect(await html.text()).toContain('Obrigado! Recebemos o seu pedido');

    const found = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Pastelaria Pedido ${run}`)}`)).json()).data as {
      id: string; channel: string; status: string; contact_name: string; next_action_text: string;
    }[];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ channel: 'site', status: 'respondeu', contact_name: 'Rita Pedido', next_action_text: 'Responder ao pedido do site' });
    const tasks = (await (await page.request.get(`/api/v1/leads/${found[0]!.id}/tasks`)).json()).data as { title: string; due_on: string }[];
    expect(tasks).toContainEqual(expect.objectContaining({ title: 'Responder ao pedido do site', due_on: addDays(0) }));
    const acts = (await (await page.request.get(`/api/v1/leads/${found[0]!.id}/activities`)).json()).data as { type: string; body: string | null }[];
    expect(acts.some((a) => a.type === 'note' && a.body?.includes('Gostava de um site para a pastelaria.'))).toBe(true);

    // A mesma pessoa outra vez (JSON, como o Webhook do Bricks): junta-se ao mesmo lead.
    const again = await anon.post(`/api/v1/public/forms/${token}`, { data: { fields: { nome: 'Rita Pedido', email, empresa: `Pastelaria Pedido ${run}`, mensagem: 'E também logótipo.' } } });
    expect(await again.json()).toEqual({ ok: true, message: expect.stringContaining('Obrigado') });
    const after = (await (await page.request.get(`/api/v1/leads?q=${encodeURIComponent(`Pastelaria Pedido ${run}`)}`)).json()).data as unknown[];
    expect(after).toHaveLength(1);

    // Robôs (campo escondido) não criam nada; sem email nem telefone não entra; código errado = 404.
    const bot = await anon.post(`/api/v1/public/forms/${token}`, { data: { nome: 'Bot', email: `bot-${run}@x.pt`, _gotcha: 'spam' } });
    expect((await bot.json()).ok).toBe(true);
    expect(((await (await page.request.get(`/api/v1/leads?q=bot-${run}`)).json()).data as unknown[]).length).toBe(0);
    expect((await anon.post(`/api/v1/public/forms/${token}`, { data: { nome: 'Só nome' } })).status()).toBe(422);
    expect((await anon.post(`/api/v1/public/forms/token-que-nao-existe-123`, { data: { email: 'a@b.pt' } })).status()).toBe(404);

    // Definições → Formulário do site mostra o endereço e o HTML.
    await page.goto('/definicoes/formulario');
    await expect(page.getByLabel('Endereço do formulário')).toContainText(`/api/v1/public/forms/${token}`);
    await expect(page.getByRole('region', { name: 'HTML pronto a colar' })).toContainText('name="_gotcha"');
  } finally {
    await anon.dispose();
    await page.request.post('/api/v1/site-form', { data: { enabled: false } });
  }
});

test('sequência multicanal: o passo na Prospeção e "Contactado" agenda o seguinte', async ({ page }) => {
  const res = await page.request.patch('/api/v1/settings', {
    data: { prospecting_sequence: { enabled: true, steps: [{ day: 0, channel: 'whatsapp' }, { day: 3, channel: 'email' }, { day: 7, channel: 'call' }] } },
  });
  expect(res.status(), await res.text()).toBe(200);
  try {
    const lead = await createLead(page.request, { company_name: `Sequência ${run}`, phone: '913 111 222', email: `seq-${run}@exemplo.pt` });
    const queue = (await (await page.request.get('/api/v1/prospecting?filter=new')).json()).data as { items: { lead: { id: string }; sequence?: unknown }[] };
    expect(queue.items.find((i) => i.lead.id === lead.id)?.sequence).toMatchObject({ step: 1, total: 3, day: 0, channel: 'whatsapp' });

    const done = await page.request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'contacted' } });
    expect(done.status(), await done.text()).toBe(200);
    const after = (await done.json()).data.lead as { status: string; next_action_on: string; next_action_text: string };
    expect(after).toMatchObject({ status: 'contactado', next_action_on: workday(addDays(3)), next_action_text: 'Passo 2 de 3: Email (dia 3)' });
    const acts = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { body: string | null }[];
    expect(acts.some((a) => a.body?.includes('Contactado — Passo 1 de 3: WhatsApp (dia 0)'))).toBe(true);

    // "Interessado" tira o lead da sequência.
    await page.request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'interested' } });
    const later = (await (await page.request.get('/api/v1/prospecting')).json()).data as { items: { lead: { id: string }; sequence?: unknown }[] };
    expect(later.items.find((i) => i.lead.id === lead.id)?.sequence ?? null).toBeNull();

    // Definições: o editor mostra os passos.
    await page.goto('/definicoes/lembretes');
    const editor = page.getByRole('region', { name: 'Sequência multicanal' });
    await expect(editor.getByLabel('Canal do passo 2')).toHaveValue('email');
    await expect(editor.getByLabel('Dia do passo 3')).toHaveValue('7');
  } finally {
    await page.request.patch('/api/v1/settings', { data: { prospecting_sequence: { enabled: false, steps: [{ day: 0, channel: 'whatsapp' }, { day: 3, channel: 'email' }, { day: 7, channel: 'call' }, { day: 14, channel: 'email' }] } } });
  }
});

test('equipa → atividade: quem fez o quê, com filtro por período', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Atividade ${run}` });
  await page.request.post(`/api/v1/leads/${lead.id}/activities`, { data: { type: 'note', body: `Nota da equipa ${run}` } });
  await page.goto('/equipa?ver=atividade');
  await expect(page.getByRole('tab', { name: /Atividade/ })).toHaveAttribute('aria-selected', 'true');
  // Por dia ("Hoje"), com o nome de quem fez quando a equipa tem mais de uma pessoa.
  const today = page.getByRole('region', { name: 'Atividade da equipa' }).getByRole('region', { name: 'Hoje' });
  const row = today.getByRole('listitem').filter({ hasText: `Nota da equipa ${run}` });
  await expect(row.getByRole('link', { name: `Atividade ${run}` })).toBeVisible();
  // Filtro por tipo: a nota está em "Tarefas e notas", não nos "Contactos".
  await page.getByRole('button', { name: 'Contactos', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Tarefas e notas' }).click();
  await expect(row).toBeVisible();
  await page.getByLabel('Período').selectOption('30');
  await expect(row).toBeVisible();
});

test('pomodoro: modo foco em ecrã inteiro e Esc para sair', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Foco ${run}`, status: 'cliente' });
  await page.goto(`/leads/${lead.id}`);
  await projectTab(page, 'Tempo e dinheiro');
  const box = page.getByRole('region', { name: 'Pomodoro' }).first();
  await box.getByRole('button', { name: /Começar \d+ min/ }).click();
  await box.getByRole('button', { name: 'Modo foco (ecrã inteiro)' }).click();
  const focus = page.getByRole('dialog', { name: 'Modo foco' });
  await expect(focus.getByRole('timer', { name: 'Tempo que falta' })).toBeVisible();
  await expect(focus.getByRole('button', { name: 'Pausar' })).toBeVisible();
  // Continua aberto enquanto o tempo corre (não fecha sozinho ao fim de 1 segundo).
  const first = await focus.getByRole('timer').textContent();
  await page.waitForTimeout(3_500);
  await expect(focus).toBeVisible();
  await expect(focus.getByRole('timer')).not.toHaveText(first!);
  // Sem a barra de deslocamento da página por baixo.
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');

  // Telemóvel bloqueado: o browser sai do ecrã inteiro, mas o modo foco fica aberto.
  await page.evaluate(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    if (document.fullscreenElement) await document.exitFullscreen();
    await new Promise((r) => setTimeout(r, 300));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  await expect(focus).toBeVisible();
  if (await page.evaluate(() => document.fullscreenEnabled)) await expect(focus.getByRole('button', { name: 'Ecrã inteiro' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(focus).toHaveCount(0);
  await box.getByRole('button', { name: 'Parar' }).click();
});
