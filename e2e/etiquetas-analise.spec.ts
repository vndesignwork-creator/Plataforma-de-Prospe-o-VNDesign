import { expect, test } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Etiquetas automáticas da análise do site: depois de analisar, o lead fica com
 * "site muito lento", "sem telemóvel"… e podem filtrar-se na lista.
 */
const run = Date.now().toString(36);
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

test('a análise do site põe etiquetas no lead', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { audit_tags: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Etiquetas ${run}`, website: 'http://127.0.0.1:4623', tags: ['feira de março'] },
  })).json()).data as { id: string };

  try {
    const audit = await page.request.post(`/api/v1/leads/${lead.id}/audits`);
    expect(audit.status(), await audit.text()).toBeLessThan(300);

    const updated = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { tags: string[] };
    // A etiqueta escrita à mão fica; as da análise entram.
    expect(updated.tags).toContain('feira de março');
    expect(updated.tags.length).toBeGreaterThan(1);
    const auto = updated.tags.filter((t) => t !== 'feira de março');
    expect(auto.length).toBeLessThanOrEqual(4);

    // Ficou registado na linha do tempo e dá para filtrar na lista.
    const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string; payload: { tags?: string[] } }[];
    const run1 = activities.find((a) => a.type === 'audit_run');
    expect(run1?.payload.tags?.length).toBeGreaterThan(0);
    const filtered = (await (await page.request.get(`/api/v1/leads?etiqueta=${encodeURIComponent(auto[0]!)}&clientes=todos`)).json()).data as { id: string }[];
    expect(filtered.some((l) => l.id === lead.id)).toBe(true);

    // Desligada a funcionalidade, a análise não mexe nas etiquetas.
    await page.request.patch('/api/v1/settings', { data: { features: { audit_tags: false } } });
    await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { tags: ['feira de março'] } });
    expect((await page.request.post(`/api/v1/leads/${lead.id}/audits`)).status()).toBeLessThan(300);
    const after = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { tags: string[] };
    expect(after.tags).toEqual(['feira de março']);
  } finally {
    await page.request.patch('/api/v1/settings', { data: { features: { audit_tags: true } } });
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
