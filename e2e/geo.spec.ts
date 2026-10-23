import { expect, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * GEO: (1) "Preparado para as IAs" no diagnóstico do site (robots.txt, dados
 * estruturados, conteúdo, contactos) e (2) "Aparece nas IAs?" com a IA falsa
 * de e2e/stubs.ts (responde com concorrentes fixos; um nome entre «…» na
 * pergunta aparece em 2.º lugar).
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

test('diagnóstico: preparado para as IAs (robots.txt bloqueia o GPTBot, sem dados estruturados)', async ({ page }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Tasca GEO ${run}`, website: SITE });
  const res = await page.request.post(`/api/v1/leads/${lead.id}/audits`, { data: {} });
  expect(res.status(), await res.text()).toBe(201);
  const audit = (await res.json()).data as { issues: { code: string }[]; suggested_problems: string; metrics: { geo?: { ai_bots_blocked: string[] } } };
  expect(audit.metrics.geo?.ai_bots_blocked).toEqual(['GPTBot']);
  expect(audit.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['ai_bots_blocked', 'no_structured_data', 'thin_content', 'no_contact_info']));
  // FAQ e mapa ficam no diagnóstico, mas não na coluna "Problemas".
  expect(audit.suggested_problems).toContain('Bloqueia as IAs');
  expect(audit.suggested_problems).not.toContain('Sem FAQ');

  await page.goto(`/leads/${lead.id}`);
  const geo = page.getByRole('region', { name: 'Preparado para as IAs (GEO)' });
  await expect(geo.getByText('Bloqueia as IAs: GPTBot')).toBeVisible();
  await expect(geo.getByText('Sem dados estruturados do negócio (schema.org)')).toBeVisible();
  await expect(geo.getByText('0 de 6')).toBeVisible();
});

test('aparece nas IAs? perguntas editáveis, resultado, concorrentes e frase para o cliente', async ({ page }) => {
  test.setTimeout(90_000);
  const name = `Padaria Visível ${run}`;
  const lead = await createLead(page.request, { company_name: name, city: 'Sintra' });

  await page.goto(`/leads/${lead.id}`);
  const card = page.getByRole('region', { name: 'Aparece nas IAs?' });
  await card.getByRole('button', { name: 'Testar' }).click();
  // Sugestões a partir da cidade (sem setor); editáveis.
  await expect(card.getByLabel('Pergunta 1', { exact: true })).toHaveValue('Que empresas recomendas em Sintra?');
  await card.getByLabel('Pergunta 1', { exact: true }).fill(`Que padarias recomendas em Sintra? «${name}»`);
  await card.getByRole('button', { name: 'Tirar a pergunta 3' }).click();
  await card.getByRole('button', { name: 'Perguntar à IA' }).click();

  await expect(card.getByText('Aparece em 1 de 2', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(`A sua empresa aparece em 1 de 2 respostas do Claude; nas outras aparecem Forno Concorrente e Pão Quente Lda.`)).toBeVisible();
  const answers = card.getByRole('list', { name: 'Respostas da IA' });
  await expect(answers.getByText('Aparece em 2.º lugar')).toBeVisible();
  await expect(answers.getByText('Não aparece')).toBeVisible();
  await answers.getByRole('button', { name: /Onde posso pedir orçamento em Sintra/ }).click();
  await expect(answers.getByRole('link', { name: /forno-concorrente\.pt/ })).toBeVisible();
  const rivals = card.getByRole('region', { name: 'Quem aparece no lugar dele' });
  await expect(rivals.getByText('Forno Concorrente')).toBeVisible();
  await expect(rivals.getByText('2× de 2').first()).toBeVisible();

  // Só um teste de cada vez por lead.
  const list = (await (await page.request.get(`/api/v1/leads/${lead.id}/ai-visibility`)).json()).data as { status: string; questions: string[] }[];
  expect(list[0]).toMatchObject({ status: 'done' });
  expect(list[0]!.questions).toHaveLength(2);

  // "Testar outra vez" começa com as perguntas do último teste.
  await card.getByRole('button', { name: 'Testar outra vez' }).click();
  await expect(card.getByLabel('Pergunta 1', { exact: true })).toHaveValue(`Que padarias recomendas em Sintra? «${name}»`);
  await card.getByRole('button', { name: 'Cancelar' }).click();

  // Validação: perguntas a mais.
  const bad = await page.request.post(`/api/v1/leads/${lead.id}/ai-visibility`, { data: { questions: Array(6).fill('Pergunta comprida o bastante?') } });
  expect(bad.status()).toBe(400);
});
