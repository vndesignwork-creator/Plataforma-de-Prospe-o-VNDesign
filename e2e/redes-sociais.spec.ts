import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

/*
 * Redes sociais dos leads na importação (colunas "Facebook"/"Instagram"), nos
 * duplicados da pré-visualização, ao juntar leads e no formulário do site.
 */
const run = Date.now().toString(36);
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number; social_links: string[] };
}
const getLead = async (request: APIRequestContext, id: string) =>
  (await (await request.get(`/api/v1/leads/${id}`)).json()).data as { social_links: string[] };

test('importação: colunas Facebook e Instagram, duplicado pela mesma página e juntar sem perder links', async ({ page }) => {
  const existing = await createLead(page.request, { company_name: `Padaria Rede ${run}`, social_links: [`https://www.facebook.com/padariarede${run}`] });

  // A pré-visualização: outro nome, o mesmo Facebook → duplicado ("social").
  const preview = await page.request.post('/api/v1/imports/preview', {
    data: {
      mapping: ['company_name', 'social_links', 'social_links'],
      rows: [
        [`Pão Quente ${run}`, `facebook.com/padariarede${run}`, `instagram.com/padariarede${run}`],
        [`Loja Nova Rede ${run}`, `https://facebook.com/lojanova${run}`, ''],
      ],
    },
  });
  expect(preview.status(), await preview.text()).toBe(200);
  const rows = (await preview.json()).data.rows as { lead: { social_links?: string[] }; duplicates: { lead_id: string; reasons: string[] }[] }[];
  expect(rows[0]!.lead.social_links).toEqual([`https://facebook.com/padariarede${run}`, `https://instagram.com/padariarede${run}`]);
  expect(rows[0]!.duplicates.find((d) => d.lead_id === existing.id)?.reasons).toContain('social');
  expect(rows[1]!.duplicates).toEqual([]);

  // Gravar: a 1.ª junta-se ao existente (fica com o Instagram também); a 2.ª é nova.
  const commit = await page.request.post('/api/v1/imports', {
    data: {
      filename: 'redes.csv',
      source: 'csv',
      keep_numbers: false,
      items: [
        { index: 0, action: 'merge', target_id: existing.id, lead: rows[0]!.lead },
        { index: 1, action: 'create', lead: rows[1]!.lead },
      ],
    },
  });
  expect(commit.status(), await commit.text()).toBe(201);
  const report = (await commit.json()).data.report as { result: string; lead_id: string }[];
  expect((await getLead(page.request, existing.id)).social_links).toEqual([
    `https://www.facebook.com/padariarede${run}`,
    `https://instagram.com/padariarede${run}`,
  ]);
  const created = report.find((r) => r.result === 'created')!;
  expect((await getLead(page.request, created.lead_id)).social_links).toEqual([`https://facebook.com/lojanova${run}`]);

  // Juntar dois leads: as redes sociais do duplicado passam para o principal.
  const merged = await page.request.post(`/api/v1/leads/${existing.id}/merge`, { data: { duplicate_ids: [created.lead_id], values: {} } });
  expect(merged.status(), await merged.text()).toBe(200);
  expect((await getLead(page.request, existing.id)).social_links).toEqual([
    `https://www.facebook.com/padariarede${run}`,
    `https://instagram.com/padariarede${run}`,
    `https://facebook.com/lojanova${run}`,
  ]);
  await page.request.delete(`/api/v1/leads/${existing.id}`);
});

test('formulário do site: o campo "facebook" vai para as Redes sociais', async ({ page }) => {
  const on = await page.request.post('/api/v1/site-form', { data: { enabled: true } });
  expect(on.status(), await on.text()).toBe(200);
  const token = (await on.json()).data.token as string;
  const anon = await playwrightRequest.newContext({ baseURL: BASE });
  try {
    const res = await anon.post(`/api/v1/public/forms/${token}`, {
      data: { fields: { nome: 'Rui Rede', email: `rede-${run}@exemplo.pt`, empresa: `Oficina Rede ${run}`, facebook: `https://facebook.com/oficina${run}`, mensagem: 'Queria um site.' } },
    });
    expect((await res.json()).ok).toBe(true);
    const found = (await (await page.request.get('/api/v1/leads', { params: { q: `Oficina Rede ${run}` } })).json()).data as { id: string; social_links: string[]; website: string | null }[];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ website: null, social_links: [`https://facebook.com/oficina${run}`] });
    await page.request.delete(`/api/v1/leads/${found[0]!.id}`);
  } finally {
    await anon.dispose();
    await page.request.post('/api/v1/site-form', { data: { enabled: false } });
  }
});
