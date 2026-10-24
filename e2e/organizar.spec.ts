import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/*
 * Ações em massa (etiqueta, estado, follow-up), gerir etiquetas (renomear,
 * juntar, apagar), "Pôr em dia" os atrasados, "Anular", follow-ups no
 * calendário subscrito, pesquisa nas notas, ditado e atalhos de teclado.
 */
const run = Date.now().toString(36);
// Dias de calendário em Lisboa (somar 24 h falha na mudança de hora).
const iso = (days: number) => {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type LeadRow = { id: string; number: number; company_name: string; tags: string[]; status: string; next_action_on: string | null };

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as LeadRow;
}
/** O "Anular" do aviso que tem este texto. */
const undo = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text }).getByRole('button', { name: 'Anular', exact: true }).click();
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data as LeadRow;

test('ações em massa: etiqueta (com Anular), estado e follow-up (com Anular)', async ({ page }) => {
  test.setTimeout(120_000);
  const name = `Massa ${run}`;
  const a = await createLead(page.request, { company_name: `${name} A` });
  const b = await createLead(page.request, { company_name: `${name} B`, tags: ['Antiga'] });

  await page.goto(`/leads?q=${encodeURIComponent(name)}`);
  await expect(page.getByText(/^2 leads com estes filtros/)).toBeVisible();
  await page.getByRole('checkbox', { name: `Selecionar #${a.number} ${a.company_name}` }).check();
  await page.getByRole('checkbox', { name: `Selecionar #${b.number} ${b.company_name}` }).check();
  const bar = page.getByRole('region', { name: 'Ações nos leads selecionados' });

  // Etiqueta nova nos dois.
  const tag = `Lote ${run}`;
  await bar.getByRole('button', { name: 'Etiqueta…' }).click();
  await page.getByRole('menuitem', { name: 'Nova etiqueta…' }).click();
  await page.getByLabel('Nova etiqueta').fill(tag);
  await page.getByRole('button', { name: 'Pôr a etiqueta' }).click();
  await expect(page.getByText(`2 leads com a etiqueta “${tag}”.`)).toBeVisible();
  await expect.poll(async () => (await getLead(page.request, b.id)).tags).toEqual(['Antiga', tag]);
  // Anular tira-a outra vez.
  await undo(page, `2 leads com a etiqueta “${tag}”.`);
  await expect.poll(async () => (await getLead(page.request, a.id)).tags).toEqual([]);
  expect((await getLead(page.request, b.id)).tags).toEqual(['Antiga']);

  // Tirar uma etiqueta que só um tem.
  await page.getByRole('checkbox', { name: `Selecionar #${a.number} ${a.company_name}` }).check();
  await page.getByRole('checkbox', { name: `Selecionar #${b.number} ${b.company_name}` }).check();
  await bar.getByRole('button', { name: 'Etiqueta…' }).click();
  await page.getByRole('menuitem', { name: 'Tirar “Antiga”' }).click();
  await expect(page.getByText('1 lead sem a etiqueta “Antiga”.')).toBeVisible();
  await expect.poll(async () => (await getLead(page.request, b.id)).tags).toEqual([]);

  // Estado: as regras aplicam-se (Contactado agenda o follow-up).
  await page.getByRole('checkbox', { name: `Selecionar #${a.number} ${a.company_name}` }).check();
  await page.getByRole('checkbox', { name: `Selecionar #${b.number} ${b.company_name}` }).check();
  await bar.getByRole('button', { name: 'Estado…' }).click();
  await page.getByRole('menuitem', { name: 'Contactado' }).click();
  await expect(page.getByText('2 leads mudaram de estado para “Contactado”.')).toBeVisible();
  const contacted = await getLead(page.request, a.id);
  expect(contacted.status).toBe('contactado');
  expect(contacted.next_action_on).not.toBeNull();

  // Follow-up para amanhã; Anular volta à data que cada um tinha.
  await page.getByRole('checkbox', { name: `Selecionar #${a.number} ${a.company_name}` }).check();
  await page.getByRole('checkbox', { name: `Selecionar #${b.number} ${b.company_name}` }).check();
  await bar.getByRole('button', { name: 'Follow-up…' }).click();
  await page.getByRole('menuitem', { name: /^Amanhã/ }).click();
  await expect(page.getByText(/^2 leads com follow-up a/)).toBeVisible();
  await expect.poll(async () => (await getLead(page.request, a.id)).next_action_on).toBe(iso(1));
  await undo(page, /^2 leads com follow-up a/);
  await expect(page.getByText('Datas repostas.')).toBeVisible();
  expect((await getLead(page.request, a.id)).next_action_on).toBe(contacted.next_action_on);
});

test('Definições → Etiquetas: juntar duas parecidas e apagar', async ({ page }) => {
  const tag = `Feira ${run}`;
  const a = await createLead(page.request, { company_name: `Etiqueta A ${run}`, tags: [tag] });
  const b = await createLead(page.request, { company_name: `Etiqueta B ${run}`, tags: [`feira ${run}x`] });

  await page.goto('/definicoes/etiquetas');
  const list = page.getByRole('list', { name: 'Etiquetas' });
  await expect(list.getByRole('link', { name: tag, exact: true })).toBeVisible();
  // "feira <run>x" → "FEIRA <run>": já existe (sem contar maiúsculas) = juntar.
  await list.getByRole('button', { name: `Renomear feira ${run}x` }).click();
  await page.getByLabel('Novo nome').fill(tag.toUpperCase());
  await expect(page.getByRole('status').getByText(`Já existe “${tag}”`)).toBeVisible();
  await page.getByRole('button', { name: 'Juntar' }).click();
  await expect(page.getByText(`“feira ${run}x” juntada a “${tag}” (1 lead).`)).toBeVisible();
  expect((await getLead(page.request, b.id)).tags).toEqual([tag]);
  await expect(list.getByText('2 leads').first()).toBeVisible();

  await list.getByRole('button', { name: `Apagar ${tag}` }).click();
  await page.getByRole('button', { name: 'Apagar etiqueta' }).click();
  await expect(page.getByText(`Etiqueta “${tag}” apagada (2 leads).`)).toBeVisible();
  expect((await getLead(page.request, a.id)).tags).toEqual([]);
  // Sem "Lead editado" na linha do tempo por renomear/apagar etiquetas.
  const activities = (await (await page.request.get(`/api/v1/leads/${a.id}/activities`)).json()).data as { type: string }[];
  expect(activities.filter((x) => x.type === 'updated')).toHaveLength(0);
});

test('Hoje: Pôr em dia os atrasados (follow-ups e tarefas) e Anular', async ({ page }) => {
  test.setTimeout(90_000);
  // Passar a "Contactado" agenda o follow-up: a data em atraso põe-se depois.
  const lead = await createLead(page.request, { company_name: `Atrasado ${run}`, status: 'contactado' });
  expect((await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { next_action_on: iso(-3), next_action_text: 'Ligar' } })).status()).toBe(200);
  const task = (await (await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: `Tarefa atrasada ${run}`, due_on: iso(-2) } })).json())
    .data as { id: string };

  await page.goto('/dashboard');
  const bar = page.getByRole('status', { name: 'Atrasados' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Pôr em dia' }).click();
  await page.getByRole('menuitem', { name: /^Amanhã/ }).click();
  await expect(page.getByText(/passaram? para/)).toBeVisible();
  await expect.poll(async () => (await getLead(page.request, lead.id)).next_action_on).toBe(iso(1));
  const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string }[];
  expect(tasks.find((t) => t.id === task.id)?.due_on).toBe(iso(1));

  await undo(page, /passaram? para/);
  await expect(page.getByText('Datas repostas.')).toBeVisible();
  expect((await getLead(page.request, lead.id)).next_action_on).toBe(iso(-3));
  const back = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string }[];
  expect(back.find((t) => t.id === task.id)?.due_on).toBe(iso(-2));
});

test('Agenda: mudar o dia tem Anular; follow-ups no calendário subscrito', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Agenda Anular ${run}`, status: 'contactado', next_action_on: iso(2), next_action_text: `Enviar proposta ${run}` });
  const title = `Rever logótipo ${run}`;
  const task = (await (await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title, due_on: iso(0) } })).json()).data as { id: string };

  await page.goto('/agenda');
  await page.getByRole('button', { name: `Mudar o dia: ${title}` }).click();
  await page.getByRole('menuitem', { name: /^Próxima semana/ }).click();
  await expect(page.getByText(/^Tarefa passou para/)).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string }[]).find((t) => t.id === task.id)?.due_on).not.toBe(iso(0));
  await undo(page, /^Tarefa passou para/);
  await expect(page.getByText(/^Tarefa voltou a/)).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { id: string; due_on: string }[]).find((t) => t.id === task.id)?.due_on).toBe(iso(0));

  // Calendário subscrito: o follow-up aparece como dia inteiro.
  const feed = (await (await page.request.post('/api/v1/calendar-feed', { data: { enabled: true } })).json()).data as { token: string };
  const ics = await (await page.request.get(`/api/v1/calendar/${feed.token}.ics`)).text();
  expect(ics).toContain(`UID:followup-${lead.id}@vndesign-leads`);
  expect(ics.replace(/\r\n /g, '')).toContain(`🔔 Enviar proposta ${run} · Agenda Anular ${run}`);
});

test('pesquisa rápida encontra o texto das notas e chamadas (sem acentos)', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Notas ${run}` });
  const res = await page.request.post(`/api/v1/leads/${lead.id}/activities`, {
    data: { type: 'note', body: `Encontrei o dono na feira. Quer uma loja online de cerâmica ${run} até ao Natal.` },
  });
  expect(res.status(), await res.text()).toBe(201);

  await page.goto('/dashboard');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(`ceramica ${run}`);
  const option = page.getByRole('option', { name: new RegExp(`loja online de cerâmica ${run}`) });
  await expect(option).toBeVisible();
  await expect(option).toContainText(`#${lead.number} Notas ${run} · Nota de`);
  await option.click();
  await expect(page).toHaveURL(new RegExp(`/leads/.*#atividade$`));
});

test('ditado: o que se diz junta-se aos apontamentos (reconhecimento de voz simulado)', async ({ page }) => {
  // O Chromium de teste não tem microfone: um reconhecimento falso que "ouve" uma frase.
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'querem loja online até ao natal' }], { isFinal: true })] });
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  const lead = await createLead(page.request, { company_name: `Ditado ${run}` });
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Notas com IA' }).click();
  const notes = page.getByLabel('Apontamentos');
  await notes.fill('Falei com a Marta.');
  await page.getByRole('button', { name: 'Ditar (falar em vez de escrever)' }).click();
  await expect(notes).toHaveValue('Falei com a Marta. Querem loja online até ao natal');
  await page.getByRole('button', { name: 'Parar o ditado' }).click();
  await expect(page.getByRole('button', { name: 'Ditar (falar em vez de escrever)' })).toBeVisible();
});

test('atalhos de teclado: G + tecla, N, ? e nada enquanto se escreve', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Hoje', exact: true })).toBeVisible();
  await page.keyboard.press('g');
  await page.keyboard.press('a');
  await expect(page).toHaveURL(/\/agenda$/);
  await page.keyboard.press('Shift+?');
  const help = page.getByRole('dialog', { name: 'Atalhos de teclado' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Projetos')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/leads\/novo$/);
  // A escrever num campo, as teclas são texto.
  const name = page.getByLabel('Empresa', { exact: false }).first();
  await name.fill('');
  await name.press('g');
  await name.press('l');
  await expect(page).toHaveURL(/\/leads\/novo$/);
  await expect(name).toHaveValue('gl');
});
