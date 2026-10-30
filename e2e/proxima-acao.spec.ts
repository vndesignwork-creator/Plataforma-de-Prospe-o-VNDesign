import { expect, test } from '@playwright/test';

/*
 * De onde vem a data da próxima ação: a ficha diz se veio com a importação, se foi
 * adiada ou alterada; e a definição "Leads importados sem próxima ação".
 */
const run = Date.now().toString(36);
const iso = (days: number) => {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const importOne = (request: import('@playwright/test').APIRequestContext, name: string) =>
  request.post('/api/v1/imports', {
    data: {
      filename: 'folha.csv',
      source: 'csv',
      keep_numbers: false,
      items: [{ index: 0, action: 'create', lead: { company_name: name, next_action_on: iso(-4), next_action_text: 'Primeiro contacto' } }],
    },
  });

test.afterAll(async ({ request }) => {
  // Volta ao normal (as datas da folha entram).
  const settings = (await (await request.get('/api/v1/settings')).json()).data;
  await request.patch('/api/v1/settings', {
    data: {
      follow_up_days: settings.follow_up_days,
      follow_up_sequence: settings.follow_up_sequence,
      auto_archive_days: settings.auto_archive_days,
      import_skip_next_action: false,
    },
  });
});

test('próxima ação: a ficha diz de onde veio a data; a importação pode ignorá-la', async ({ page }) => {
  const settings = (await (await page.request.get('/api/v1/settings')).json()).data;
  const base = { follow_up_days: settings.follow_up_days, follow_up_sequence: settings.follow_up_sequence, auto_archive_days: settings.auto_archive_days };
  await page.request.patch('/api/v1/settings', { data: { ...base, import_skip_next_action: false } });

  // Importada com data: "Veio com a importação da folha".
  expect((await importOne(page.request, `Importada Data ${run}`)).status()).toBe(201);
  const list = (await (await page.request.get('/api/v1/leads', { params: { q: `Importada Data ${run}` } })).json()).data as {
    id: string;
    next_action_on: string | null;
  }[];
  const lead = list[0]!;
  expect(lead.next_action_on).toBe(iso(-4));
  await page.goto(`/leads/${lead.id}`);
  const bar = page.getByRole('region', { name: 'Próximo passo' });
  await expect(bar).toContainText('Veio com a importação da folha');

  // Adiar: passa a "Adiado a …".
  const res = await page.request.post(`/api/v1/leads/${lead.id}/follow-up`, { data: { action: 'snooze', days: 2 } });
  expect(res.ok(), await res.text()).toBe(true);
  await page.reload();
  await expect(bar).toContainText(/Adiado a \d{2}\/\d{2}/);

  // Com a definição ligada, os leads ainda não contactados entram sem data.
  await page.request.patch('/api/v1/settings', { data: { ...base, import_skip_next_action: true } });
  expect((await importOne(page.request, `Importada Sem Data ${run}`)).status()).toBe(201);
  const skipped = (await (await page.request.get('/api/v1/leads', { params: { q: `Importada Sem Data ${run}` } })).json()).data as {
    next_action_on: string | null;
    next_action_text: string | null;
  }[];
  expect(skipped[0]).toMatchObject({ next_action_on: null, next_action_text: null });

  // A definição está em Definições → Follow-up e lembretes.
  await page.goto('/definicoes/lembretes');
  await expect(page.getByLabel('Leads importados sem próxima ação')).toBeChecked();
});
