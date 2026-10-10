import { expect, test } from '@playwright/test';

/* Definições → Serviços: criar, usar num lead, mudar o nome, esconder e apagar. */
const run = Date.now().toString(36);

test('criar um serviço novo e usá-lo num lead', async ({ page }) => {
  const name = `Fotografia ${run}`;
  await page.goto('/definicoes/servicos');
  await expect(page.getByRole('heading', { name: 'Serviços', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Novo serviço' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo serviço' });
  await dialog.getByRole('textbox', { name: 'Nome', exact: true }).fill(name);
  await dialog.getByLabel('Nome curto (opcional)').fill('Fotos');
  await dialog.getByRole('radio', { name: 'Fotografia' }).click();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Serviço criado.')).toBeVisible();
  const list = page.getByRole('list', { name: 'Serviços' });
  await expect(list.getByText(name)).toBeVisible();

  const services = (await (await page.request.get('/api/v1/services')).json()).data as { key: string; label: string; category: string }[];
  const created = services.find((s) => s.label === name)!;
  expect(created.category).toBe('outros');
  expect(created.key).toBe(`fotografia_${run}`);

  // Escolher no formulário do lead.
  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Estúdio ${run}` } })).json()).data;
  await page.goto(`/leads/${lead.id}/editar`);
  await page.getByRole('group', { name: 'Outros serviços' }).getByLabel(name).check();
  await page.getByRole('button', { name: 'Gravar alterações' }).click();
  await expect(page.getByRole('list', { name: 'Serviços de interesse' }).getByText(name)).toBeVisible();

  // Mudar o nome reflete-se no lead.
  await page.goto('/definicoes/servicos');
  await list.getByRole('button', { name: `Editar ${name}` }).click();
  await page.getByRole('dialog', { name: 'Editar serviço' }).getByRole('textbox', { name: 'Nome', exact: true }).fill(`${name} e vídeo`);
  await page.getByRole('dialog', { name: 'Editar serviço' }).getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Serviço guardado.')).toBeVisible();
  const row = list.getByRole('listitem').filter({ hasText: `${name} e vídeo` });
  await expect(row.getByText('1 lead')).toBeVisible();

  // Com leads não se apaga; esconde-se.
  await expect(list.getByRole('button', { name: `${name} e vídeo tem leads: esconde em vez de apagar` })).toBeDisabled();
  await list.getByRole('button', { name: `Esconder ${name} e vídeo` }).click();
  await expect(page.getByText('Serviço escondido.')).toBeVisible();
  await expect(row.getByText('Escondido')).toBeVisible();

  // O lead continua com ele; no formulário aparece como escondido.
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('list', { name: 'Serviços de interesse' }).getByText(`${name} e vídeo`)).toBeVisible();
  await page.goto(`/leads/${lead.id}/editar`);
  await expect(page.getByRole('group', { name: 'Outros serviços' }).getByText('(escondido)')).toBeVisible();
});

test('API: serviço desconhecido é recusado; apagar um serviço sem leads', async ({ page }) => {
  const bad = await page.request.post('/api/v1/leads', { data: { company_name: `Sem serviço ${run}`, services: ['nao_existe'] } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).detail).toContain('Serviço desconhecido');

  const created = await page.request.post('/api/v1/services', { data: { label: `Consultoria ${run}`, category: 'web', icon: 'briefcase' } });
  expect(created.status()).toBe(201);
  const service = (await created.json()).data;
  const repeated = await page.request.post('/api/v1/services', { data: { label: `consultoria ${run}` } });
  expect(repeated.status()).toBe(409);

  await page.goto('/definicoes/servicos');
  const list = page.getByRole('list', { name: 'Serviços' });
  await list.getByRole('button', { name: `Apagar Consultoria ${run}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apagar' }).click();
  await expect(page.getByText('Serviço apagado.')).toBeVisible();
  await expect(list.getByText(`Consultoria ${run}`)).toHaveCount(0);
  expect((await page.request.delete(`/api/v1/services/${service.id}`)).status()).toBe(404);
});
