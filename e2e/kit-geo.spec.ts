import { expect, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Kit GEO (perfil do Google, dados estruturados, perguntas frequentes, llms.txt),
 * GEO como serviço (sugerir o serviço no diagnóstico, scripts com {{visibilidade_ia}}).
 * IA falsa em e2e/stubs.ts; site de teste em http://127.0.0.1:4623 (robots.txt bloqueia o GPTBot).
 */
const run = Date.now().toString(36);
const SITE = 'http://127.0.0.1:4623/';
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; company_name: string };
}

test('kit GEO: perfil do Google com concorrentes, dados estruturados, perguntas frequentes e llms.txt', async ({ page }) => {
  test.setTimeout(120_000);
  const name = `Obras Kit ${run}`;
  const lead = await createLead(page.request, {
    company_name: name, city: 'Amadora', phone: '214 000 222', email: `geral-${run}@obraskit.pt`, address: 'Rua A 1, 2700-001 Amadora', website: `https://obraskit-${run}.pt`,
  });
  // Concorrentes vêm do último "Aparece nas IAs?".
  const started = await page.request.post(`/api/v1/leads/${lead.id}/ai-visibility`, { data: { questions: ['Que construtoras recomendas na Amadora?'] } });
  expect(started.status(), await started.text()).toBe(202);
  await expect
    .poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/ai-visibility`)).json()).data as { status: string }[])[0]?.status, { timeout: 20_000 })
    .toBe('done');

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('tablist', { name: 'Site e presença online' }).getByRole('tab', { name: 'Kit GEO', exact: true }).click();
  const kit = page.getByRole('region', { name: 'Kit GEO' });
  await kit.getByRole('button', { name: 'Ver no Google' }).click();
  const profiles = kit.getByRole('list', { name: 'Perfis do Google' });
  await expect(profiles.getByRole('listitem').first()).toContainText('4,1', { timeout: 60_000 });
  await expect(profiles.getByRole('listitem').first()).toContainText('12 avaliações');
  await expect(profiles.getByText('Forno Concorrente')).toBeVisible();
  await expect(kit.getByText('No Google Maps, a sua empresa tem 4,1★ com 12 avaliações; os concorrentes que as IAs recomendam têm em média 4,7★ e 150 avaliações.')).toBeVisible();
  await expect(kit.getByText(/pesquisa da IA \(aproximada\)/)).toBeVisible();

  // Confirmar à mão depois de ver no Maps: fica guardado e não se perde ao atualizar.
  await expect(profiles.getByRole('link', { name: new RegExp(`Abrir ${name} no Google Maps|Procurar ${name} no Google Maps`) })).toBeVisible();
  await profiles.getByRole('button', { name: `Confirmar o perfil de ${name}` }).click();
  const confirm = page.getByRole('dialog', { name: `Perfil do Google · ${name}` });
  await confirm.getByRole('radio', { name: 'Tem perfil', exact: true }).click();
  await confirm.getByLabel('Nota (1 a 5)').fill('4,8');
  await confirm.getByLabel('N.º de avaliações').fill('30');
  await confirm.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(`Perfil de ${name} confirmado.`)).toBeVisible();
  await expect(profiles.getByRole('listitem').first()).toContainText('4,8');
  await expect(profiles.getByRole('listitem').first()).toContainText('30 avaliações');
  await expect(profiles.getByRole('listitem').first()).toContainText('Confirmado por ti');
  await kit.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByText('Perfil do Google atualizado.')).toBeVisible({ timeout: 60_000 });
  await expect(profiles.getByRole('listitem').first()).toContainText('4,8');

  // Dados estruturados: sugestões da ficha, editar e guardar.
  await kit.getByRole('tab', { name: 'Dados estruturados' }).click();
  const code = kit.getByLabel('Código schema.org (JSON-LD)');
  await expect(code).toContainText('"postalCode": "2700-001"');
  await kit.getByLabel('Descrição curta').fill('Remodelações na Amadora há 15 anos.');
  await kit.getByLabel(/Horário/).fill('Seg–Sex 09:00–18:00');
  await expect(code).toContainText('"openingHours": [\n    "Mo-Fr 09:00-18:00"');
  await kit.getByRole('button', { name: 'Guardar dados' }).click();
  await expect(page.getByText('Dados do negócio guardados.')).toBeVisible({ timeout: 30_000 });
  const saved = (await (await page.request.get(`/api/v1/leads/${lead.id}/geo`)).json()).data as { business: { description: string }; business_saved: boolean };
  expect(saved).toMatchObject({ business_saved: true, business: { description: 'Remodelações na Amadora há 15 anos.' } });

  // Perguntas frequentes com IA: editar e guardar; HTML e FAQPage prontos a copiar.
  await kit.getByRole('tab', { name: 'Perguntas frequentes' }).click();
  await kit.getByRole('button', { name: 'Escrever com IA' }).click();
  await expect(kit.getByLabel('Pergunta 1', { exact: true })).toHaveValue('Fazem orçamentos sem compromisso?', { timeout: 60_000 });
  await kit.getByLabel('Pergunta 2', { exact: true }).fill('Trabalham fora da Amadora?');
  await kit.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Perguntas frequentes guardadas.')).toBeVisible();
  await expect(kit.getByLabel('HTML das perguntas (acordeão)')).toContainText('<summary>Trabalham fora da Amadora?</summary>');
  await expect(kit.getByLabel('Código schema.org FAQPage (JSON-LD)')).toContainText('"@type": "FAQPage"');

  // llms.txt com os dados e as perguntas guardadas.
  await kit.getByRole('tab', { name: 'llms.txt' }).click();
  const llms = kit.getByLabel('llms.txt');
  await expect(llms).toContainText(`# ${name}`);
  await expect(llms).toContainText('> Remodelações na Amadora há 15 anos.');
  await expect(llms).toContainText('### Trabalham fora da Amadora?');
});

test('GEO como serviço: sugerido no diagnóstico, pacotes e scripts com {{visibilidade_ia}}', async ({ page }) => {
  test.setTimeout(120_000);
  const lead = await createLead(page.request, { company_name: `Tasca Serviço GEO ${run}`, website: SITE, city: 'Amadora' });
  expect((await page.request.post(`/api/v1/leads/${lead.id}/audits`, { data: {} })).status()).toBe(201);

  // O catálogo já tem o serviço e os pacotes.
  const services = (await (await page.request.get('/api/v1/services')).json()).data as { key: string; label: string }[];
  expect(services).toContainEqual(expect.objectContaining({ key: 'geo', label: 'Otimização para IAs (GEO)' }));
  const packages = (await (await page.request.get('/api/v1/packages')).json()).data as { name: string; service: string | null }[];
  expect(packages.filter((p) => p.service === 'geo').map((p) => p.name)).toEqual(expect.arrayContaining(['GEO — Preparar para as IAs', 'GEO — Acompanhamento mensal']));

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('region', { name: 'Preparado para as IAs (GEO)' }).getByRole('button', { name: /Juntar o serviço “Otimização para IAs \(GEO\)” ao lead/ }).click();
  await expect(page.getByText(/Serviço “Otimização para IAs \(GEO\)” juntado ao lead/)).toBeVisible();
  expect(((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { services: string[] }).services).toContain('geo');

  // Script GEO com a frase do teste "Aparece nas IAs?".
  const templates = (await (await page.request.get('/api/v1/templates')).json()).data as { id: string; name: string }[];
  const geoEmail = templates.find((t) => t.name === 'Email de prospeção — GEO (aparecer nas IAs)')!;
  expect(geoEmail).toBeTruthy();
  const before = await page.request.post(`/api/v1/leads/${lead.id}/render-template`, { data: { template_id: geoEmail.id } });
  expect((await before.json()).data.body).toContain('Fiz as perguntas que um cliente faria e a vossa empresa não apareceu nas respostas.');
  await page.request.post(`/api/v1/leads/${lead.id}/ai-visibility`, { data: { questions: ['Que tascas recomendas na Amadora?'] } });
  await expect
    .poll(async () => ((await (await page.request.get(`/api/v1/leads/${lead.id}/ai-visibility`)).json()).data as { status: string }[])[0]?.status, { timeout: 20_000 })
    .toBe('done');
  const after = await page.request.post(`/api/v1/leads/${lead.id}/render-template`, { data: { template_id: geoEmail.id } });
  expect((await after.json()).data.body).toContain('a sua empresa não aparece na resposta.');
});
