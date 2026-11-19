import { expect, test } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Caso de estudo com IA a partir de um projeto concluído: escreve-se na ficha,
 * fica guardado, copia-se o texto e sai em PDF.
 */
const run = Date.now().toString(36);
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

test('caso de estudo: escrever com IA, guardar e PDF', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, deliverables: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Caso ${run}`, status: 'cliente', city: 'Braga', problems: 'Site lento e sem telemóvel', services: ['site_institucional'] },
  })).json()).data as { id: string };

  try {
    // Sem o projeto concluído não há caso de estudo.
    const tooSoon = await page.request.post(`/api/v1/leads/${lead.id}/case-study`, { data: {} });
    expect(tooSoon.status()).toBe(409);
    expect((await (await page.request.get(`/api/v1/leads/${lead.id}/case-study`)).json()).data).toBeNull();

    await page.request.post(`/api/v1/leads/${lead.id}/project`, { data: { completed: true, portfolio_task: false } });
    const made = await page.request.post(`/api/v1/leads/${lead.id}/case-study`, { data: { tone: 'profissional' } });
    expect(made.status(), await made.text()).toBe(200);
    const study = (await made.json()).data as { title: string; work: string[]; model: string; anonymous: boolean };
    expect(study.title).toBe('Site novo, mais rápido e pronto para telemóvel');
    expect(study.work.length).toBeGreaterThan(0);
    expect(study.model).toBeTruthy();

    // Fica guardado (não se escreve outra vez à toa).
    const saved = (await (await page.request.get(`/api/v1/leads/${lead.id}/case-study`)).json()).data as { title: string };
    expect(saved.title).toBe(study.title);

    // Sai em PDF.
    const pdf = await page.request.get(`/api/v1/leads/${lead.id}/case-study/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    // Na ficha: ver o caso e apagá-lo.
    await page.goto(`/leads/${lead.id}`);
    await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: /^Cliente/ }).click();
    const section = page.getByRole('region', { name: 'Caso de estudo' });
    await section.getByRole('button', { name: 'Ver' }).click();
    const dialog = page.getByRole('dialog', { name: study.title });
    await expect(dialog).toContainText('O desafio');
    await expect(dialog).toContainText('Site novo em WordPress');
    await page.keyboard.press('Escape');

    expect((await page.request.delete(`/api/v1/leads/${lead.id}/case-study`)).status()).toBe(204);
    expect((await (await page.request.get(`/api/v1/leads/${lead.id}/case-study`)).json()).data).toBeNull();
    expect((await page.request.get(`/api/v1/leads/${lead.id}/case-study/pdf`)).status()).toBe(404);
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
