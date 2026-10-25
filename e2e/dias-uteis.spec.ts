import { expect, test, type APIRequestContext } from '@playwright/test';

/* Dias úteis: os follow-ups automáticos não caem ao fim de semana (a não ser que se trabalhe ao fim de semana). */
const run = Date.now().toString(36);
const lisbonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const iso = (days: number) => {
  const d = new Date(`${lisbonToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo

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

test('a antiga Agenda leva ao Dashboard (e já não está no menu)', async ({ page }) => {
  await page.goto('/agenda');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('navigation', { name: 'Principal' }).first().getByRole('link', { name: 'Agenda' })).toHaveCount(0);
});
