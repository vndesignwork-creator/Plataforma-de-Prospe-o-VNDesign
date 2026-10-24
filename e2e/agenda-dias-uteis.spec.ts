import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/*
 * Dias úteis (os follow-ups automáticos não caem ao fim de semana) e a Agenda
 * nova: resumo da semana, follow-ups num número por dia, "Tirar da agenda" e
 * "Distribuir pela semana", sempre com Anular.
 */
const run = Date.now().toString(36);
const lisbonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const iso = (days: number) => {
  const d = new Date(`${lisbonToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
const dayLong = (date: string) =>
  new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const undo = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text }).getByRole('button', { name: 'Anular', exact: true }).click();

type LeadRow = { id: string; number: number; next_action_on: string | null; next_action_text: string | null };
async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as LeadRow;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data as LeadRow;

test('dias úteis: adiar para um sábado passa para segunda; a trabalhar ao fim de semana fica no sábado', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Fim de Semana ${run}`, status: 'contactado' });
  const toSaturday = (6 - weekday(iso(0)) + 7) % 7 || 7;
  let res = await page.request.post(`/api/v1/leads/${lead.id}/follow-up`, { data: { action: 'snooze', days: toSaturday } });
  expect(res.status(), await res.text()).toBe(200);
  expect((await getLead(page.request, lead.id)).next_action_on).toBe(iso(toSaturday + 2));

  try {
    expect((await page.request.patch('/api/v1/settings', { data: { work_weekends: true } })).status()).toBe(200);
    res = await page.request.post(`/api/v1/leads/${lead.id}/follow-up`, { data: { action: 'snooze', days: toSaturday } });
    expect(res.status(), await res.text()).toBe(200);
    expect((await getLead(page.request, lead.id)).next_action_on).toBe(iso(toSaturday));
    await page.goto('/definicoes/lembretes');
    await expect(page.getByLabel('Também trabalho ao fim de semana')).toBeChecked();
  } finally {
    await page.request.patch('/api/v1/settings', { data: { work_weekends: false } });
  }
});

test('Agenda: follow-ups num número por dia; tirar da agenda e distribuir pela semana (com Anular)', async ({ page }) => {
  test.setTimeout(120_000);
  // Quarta-feira da próxima semana, com 10 follow-ups.
  const day = iso(9 - ((weekday(iso(0)) + 6) % 7));
  const leads: LeadRow[] = [];
  for (let i = 0; i < 10; i++) {
    leads.push(await createLead(page.request, { company_name: `Distribuir ${run} ${i}`, next_action_on: day, next_action_text: `Ligar ${run} ${i}` }));
  }

  await page.goto('/agenda');
  await expect(page.getByLabel('Resumo da semana')).toContainText('Esta semana:');
  await page.getByRole('button', { name: 'Semana seguinte' }).click();
  const section = page.getByRole('listitem', { name: dayLong(day) });
  const group = section.getByRole('group', { name: /^Follow-ups de/ });
  const toggle = group.getByRole('button', { name: /\d+ follow-ups/ });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  // Muitos: recolhidos (abrem-se com um toque).
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();

  // Tirar da agenda (e Anular).
  await group.getByRole('button', { name: `Mudar o dia: Ligar ${run} 0` }).click();
  await page.getByRole('menuitem', { name: 'Tirar da agenda' }).click();
  await expect.poll(async () => (await getLead(page.request, leads[0]!.id)).next_action_on).toBeNull();
  await undo(page, /tirado da agenda/);
  await expect(page.getByText('Datas repostas.')).toBeVisible();
  expect(await getLead(page.request, leads[0]!.id)).toMatchObject({ next_action_on: day, next_action_text: `Ligar ${run} 0` });

  // Distribuir: o dia fica com 8 no máximo; os outros vão para dias úteis seguintes.
  await section.getByRole('button', { name: 'Distribuir' }).click();
  await expect(page.getByText(/passaram? para os dias seguintes/)).toBeVisible();
  const calendar = async () =>
    (
      (await (await page.request.get(`/api/v1/projects/calendar?from=${day}&to=${iso(30)}&followups=true`)).json()).data as {
        type: string;
        date: string;
      }[]
    ).filter((e) => e.type === 'followup');
  await expect.poll(async () => (await calendar()).filter((e) => e.date === day).length).toBeLessThanOrEqual(8);
  const dates = await Promise.all(leads.map(async (l) => (await getLead(page.request, l.id)).next_action_on!));
  for (const d of dates) expect([0, 6]).not.toContain(weekday(d));

  await undo(page, /passaram? para os dias seguintes/);
  await expect(page.getByText('Datas repostas.')).toBeVisible();
  for (const l of leads) expect((await getLead(page.request, l.id)).next_action_on).toBe(day);
});
