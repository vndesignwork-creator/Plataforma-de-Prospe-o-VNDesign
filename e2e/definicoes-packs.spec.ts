import { expect, test } from '@playwright/test';

/* Definições: etiquetas, packs de campos, ideias de regras (desligadas), listas e serviços de Motion/Vídeo e a versão. */
const run = Date.now().toString(36);

test('Etiquetas: criar uma etiqueta sem leads, aparece nas sugestões; apagar tira-a', async ({ page }) => {
  const tag = `feira ${run}`;
  await page.goto('/definicoes/etiquetas');
  await page.getByLabel('Nova etiqueta').fill(tag);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByText(`Etiqueta “${tag}” criada`)).toBeVisible();
  const row = page.getByRole('list', { name: 'Etiquetas' }).getByRole('listitem').filter({ hasText: tag });
  await expect(row.getByText('ainda sem leads')).toBeVisible();
  const tags = (await (await page.request.get('/api/v1/leads/tags')).json()).data as { tag: string; count: number }[];
  expect(tags).toContainEqual({ tag, count: 0 });
  // A mesma (sem contar maiúsculas) não se cria duas vezes.
  await page.getByLabel('Nova etiqueta').fill(tag.toUpperCase());
  await expect(page.getByText(`Já existe “${tag}”.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar' })).toBeDisabled();
  // Apagar: sai da lista.
  expect((await page.request.patch('/api/v1/leads/tags', { data: { from: tag, to: null } })).status()).toBe(200);
  const after = (await (await page.request.get('/api/v1/leads/tags')).json()).data as { tag: string }[];
  expect(after.some((t) => t.tag === tag)).toBe(false);
});

test('Campos personalizados: os packs não estão ativos até "Juntar"; os que já existem não se repetem', async ({ page }) => {
  const list = async () => (await (await page.request.get('/api/v1/custom-fields')).json()).data as { id: string; label: string }[];
  for (const f of (await list()).filter((f) => ['Marcações online?', 'Nº de profissionais', 'Especialidade'].includes(f.label))) {
    await page.request.delete(`/api/v1/custom-fields/${f.id}`);
  }
  await page.goto('/definicoes/campos');
  const pack = page.getByRole('list', { name: 'Packs de campos' }).getByRole('listitem').filter({ hasText: 'Saúde e bem-estar' }).first();
  await expect(pack.getByRole('button', { name: /^Juntar/ })).toBeVisible();
  expect((await list()).some((f) => f.label === 'Especialidade')).toBe(false);
  await pack.getByRole('button', { name: /^Juntar/ }).click();
  await expect(page.getByText('Pack “Saúde e bem-estar” juntado: 3 campos novos.')).toBeVisible();
  await expect(pack.getByText('Já juntado')).toBeVisible();
  const added = (await list()).filter((f) => ['Marcações online?', 'Nº de profissionais', 'Especialidade'].includes(f.label));
  expect(added).toHaveLength(3);
  for (const f of added) await page.request.delete(`/api/v1/custom-fields/${f.id}`);
});

test('Regras automáticas: "Juntar todas" cria as ideias desligadas', async ({ page }) => {
  const rules = async () => (await (await page.request.get('/api/v1/automation-rules')).json()).data as { id: string; name: string; enabled: boolean }[];
  const ideas = ['Proposta parada há 14 dias', 'Novo cliente: pedir avaliação', 'Veio do Google Maps: ligar'];
  const all = [
    'Sem site', 'Sem resposta há 21 dias', 'Respondeu: responder hoje', 'Sem email: procurar contacto', 'Sem telefone: procurar',
    'Tem site: analisar antes de contactar', 'Contactado há 7 dias: follow-up', 'Reunião marcada: preparar', 'Proposta enviada: ligar em 3 dias',
    'Proposta parada há 14 dias', 'Novo cliente: pedir avaliação', 'Em pausa há 90 dias: tentar outra vez', 'Veio do Instagram: mensagem', 'Veio do Google Maps: ligar',
  ];
  for (const r of (await rules()).filter((r) => all.includes(r.name))) await page.request.delete(`/api/v1/automation-rules/${r.id}`);
  await page.goto('/definicoes/regras');
  await page.getByRole('button', { name: 'Juntar todas (desligadas)' }).click();
  await expect(page.getByText(/regras? juntadas?, desligadas?: liga as que quiseres\./)).toBeVisible();
  const now = await rules();
  for (const name of ideas) expect(now.find((r) => r.name === name)?.enabled).toBe(false);
  for (const r of now.filter((r) => all.includes(r.name))) await page.request.delete(`/api/v1/automation-rules/${r.id}`);
});

test('Listas de tarefas: Motion design e Edição de vídeo prontas a usar', async ({ page }) => {
  const res = await page.request.get('/api/v1/task-templates');
  const names = ((await res.json()).data as { name: string; items: string[] }[]).map((t) => t.name);
  expect(names).toEqual(expect.arrayContaining(['Motion design', 'Edição de vídeo']));
});

test('Serviços: Vídeo e Motion Design com serviços e pacotes prontos (o mensal é recorrente)', async ({ page }) => {
  const services = ((await (await page.request.get('/api/v1/services')).json()).data as { key: string; label: string }[]).map((s) => s.key);
  expect(services).toEqual(expect.arrayContaining(['motion_design', 'edicao_video', 'reels', 'video_institucional', 'animacao_logotipo']));
  const packages = (await (await page.request.get('/api/v1/packages')).json()).data as { name: string; service: string | null }[];
  expect(packages.find((p) => p.name === 'Reels — pack de 4')?.service).toBe('reels');
  expect(packages.find((p) => p.name === 'Motion design (até 30 s)')?.service).toBe('motion_design');
  await page.goto('/definicoes/servicos');
  await expect(page.getByText('Vídeo e Motion Design').first()).toBeVisible();
  await page.goto('/definicoes/propostas');
  await expect(page.getByText('Edição de vídeo — mensal').first()).toBeVisible();
});

test('Definições: mostra a versão da plataforma (a mesma de /api/version)', async ({ page }) => {
  const { build } = (await (await page.request.get('/api/version')).json()) as { build: string };
  await page.goto('/definicoes/campos');
  const footer = page.getByRole('region', { name: 'Versão da plataforma' });
  await expect(footer).toContainText(build);
  await expect(footer).toContainText('É a mais recente');
});

test('Scripts: modelos de Vídeo e Motion na categoria de vídeo', async ({ page }) => {
  const templates = (await (await page.request.get('/api/v1/templates')).json()).data as { name: string; kind: string; category: string | null }[];
  const video = templates.filter((t) => t.name.includes('Vídeo e Motion') || t.name.includes('Reels (redes sem vídeo)'));
  expect(video.map((t) => t.kind).sort()).toEqual(['call_script', 'cold_email', 'cold_email', 'follow_up', 'social_dm', 'whatsapp']);
  expect(new Set(video.map((t) => t.category)).size).toBe(1);
});
