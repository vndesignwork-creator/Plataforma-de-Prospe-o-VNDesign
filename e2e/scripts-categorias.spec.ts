import { expect, test } from '@playwright/test';

/* Scripts de contacto por categoria de serviço: escolha automática do modelo e as variáveis dos serviços. */
const run = Date.now().toString(36);

test('lead de Design Gráfico: modelo da categoria com {{servicos}} e {{beneficio}}', async ({ page }) => {
  const post = async (data: object) => (await (await page.request.post('/api/v1/leads', { data })).json()).data;
  const grafico = await post({ company_name: `Pastelaria ${run}`, services: ['flyers_cartazes', 'identidade_visual'] });
  const semServicos = await post({ company_name: `Sem serviços ${run}` });

  await page.goto(`/leads/${grafico.id}`);
  await expect(page.getByRole('heading', { name: 'Scripts de contacto' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#script-template option:checked')).toHaveText('Email de prospeção — Design Gráfico');
  const message = page.getByRole('textbox', { name: 'Mensagem' });
  await expect(message).toHaveValue(/Trabalho em identidade visual e flyers e cartazes para negócios/);
  await expect(message).toHaveValue(/há espaço para uma imagem coerente que os clientes reconhecem à primeira vista\./);
  await expect(page.getByRole('textbox', { name: 'Assunto' })).toHaveValue(`Uma ideia para a imagem da Pastelaria ${run}`);

  // Sem serviços: continua o modelo de origem.
  await page.goto(`/leads/${semServicos.id}`);
  await expect(page.locator('#script-template option:checked')).toHaveText('Email de prospeção — modelo VNDesign');
});

test('serviço novo com frase de valor: o modelo genérico usa-a', async ({ page }) => {
  const name = `Vídeo ${run}`;
  await page.goto('/definicoes/servicos');
  await page.getByRole('button', { name: 'Novo serviço' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo serviço' });
  await dialog.getByRole('textbox', { name: 'Nome', exact: true }).fill(name);
  await dialog.getByLabel('Categoria').selectOption({ label: 'Outros serviços' });
  await dialog.getByLabel('Frase de valor (opcional)').fill('vídeos curtos que mostram o vosso espaço');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Serviço criado.')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Serviços' }).getByRole('listitem').filter({ hasText: name }).getByText('“vídeos curtos que mostram o vosso espaço”'),
  ).toBeVisible();

  const services = (await (await page.request.get('/api/v1/services')).json()).data as { key: string; label: string; value_phrase: string | null }[];
  const created = services.find((s) => s.label === name)!;
  expect(created.value_phrase).toBe('vídeos curtos que mostram o vosso espaço');

  const lead = (await (await page.request.post('/api/v1/leads', { data: { company_name: `Ginásio ${run}`, services: [created.key] } })).json()).data;
  await page.goto(`/leads/${lead.id}`);
  // "Outros serviços" não tem modelos próprios: os de todas as categorias vêm antes dos de Web Design.
  await expect(page.locator('#script-template option:checked')).not.toHaveText(/Web|modelo VNDesign|diagnóstico/);
  await page.locator('#script-template').selectOption({ label: 'Email de prospeção — genérico' });
  await expect(page.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(/ajudar a ter vídeos curtos que mostram o vosso espaço\./);
  await expect(page.getByRole('textbox', { name: 'Mensagem' })).toHaveValue(new RegExp(`Trabalho em vídeo ${run} para negócios`));

  // A API de pré-visualização preenche as mesmas variáveis.
  const templates = (await (await page.request.get('/api/v1/templates')).json()).data as { id: string; name: string; category: string | null }[];
  const generic = templates.find((t) => t.name === 'Email de prospeção — genérico')!;
  expect(generic.category).toBeNull();
  const rendered = (await (await page.request.post(`/api/v1/leads/${lead.id}/render-template`, { data: { template_id: generic.id } })).json()).data;
  expect(rendered.body).toContain('vídeos curtos que mostram o vosso espaço');
});

test('página Scripts: filtro por categoria e categoria no editor', async ({ page }) => {
  await page.goto('/scripts');
  const nav = page.getByRole('navigation', { name: 'Modelos' });
  await expect(nav.getByRole('button', { name: /Email de prospeção — Design Gráfico/ })).toBeVisible();
  await nav.getByLabel(/Categoria dos modelos/).click();
  await page.getByRole('menuitemradio', { name: 'Design Gráfico' }).click();
  // Design Gráfico: os seus e os de todas as categorias; os de Web Design saem.
  await expect(nav.getByRole('button', { name: /Email de prospeção — genérico/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /Email frio — diagnóstico/ })).toHaveCount(0);

  await nav.getByRole('button', { name: /Follow-up — Design Gráfico/ }).click();
  await expect(page.getByLabel('Categoria de serviço').locator('option:checked')).toHaveText('Design Gráfico');
});
