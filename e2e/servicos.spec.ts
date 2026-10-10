import { expect, test } from '@playwright/test';

/* Serviços de interesse (Web Design / Design Gráfico): lead, filtros, pacotes e propostas. */
const run = Date.now().toString(36);

test('lead com serviços de design gráfico: escolher, ver na ficha e filtrar na lista', async ({ page }) => {
  const name = `Café Imagem ${run}`;
  await page.goto('/leads/novo');
  await page.getByLabel('Empresa', { exact: false }).first().fill(name);
  await page.getByRole('checkbox', { name: 'Identidade Visual' }).check();
  await page.getByRole('checkbox', { name: 'Posts Rede Social' }).check();
  await page.getByRole('button', { name: 'Criar lead' }).click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 });
  const chips = page.getByRole('list', { name: 'Serviços de interesse' });
  await expect(chips.getByText('Identidade Visual')).toBeVisible();
  await expect(chips.getByText('Posts Rede Social')).toBeVisible();

  // Filtro "Serviço" na lista (pelo endereço, como fica ao escolher no menu).
  await page.goto(`/leads?q=${encodeURIComponent(name)}&servico=posts_redes`);
  await expect(page.getByText('1 lead com estes filtros')).toBeVisible();
  await page.goto(`/leads?q=${encodeURIComponent(name)}&servico=loja_online`);
  await expect(page.getByText('Nenhum lead com estes filtros')).toBeVisible();
});

test('proposta nova sugere os pacotes dos serviços do lead (site + logótipo)', async ({ page }) => {
  const res = await page.request.post('/api/v1/leads', {
    data: { company_name: `Clínica Marca ${run}`, services: ['site_institucional', 'identidade_visual'] },
  });
  expect(res.status()).toBe(201);
  const lead = (await res.json()).data;

  await page.goto(`/leads/${lead.id}/propostas/nova`);
  const items = page.getByRole('list', { name: 'Itens da proposta' });
  await expect(items.getByLabel('Nome').first()).toHaveValue('Profissional');
  // Nenhum pacote de identidade visual é "recomendado": fica o primeiro (Logótipo).
  await expect(items.getByLabel('Nome').nth(1)).toHaveValue('Logótipo');
  // Os pacotes de design gráfico aparecem no seu grupo.
  await expect(page.getByRole('group', { name: 'Acrescentar pacote' }).getByText('Design Gráfico')).toBeVisible();
});

test('definições: pacotes agrupados por Web Design e Design Gráfico', async ({ page }) => {
  await page.goto('/definicoes#propostas');
  const list = page.locator('#propostas').getByRole('list', { name: 'Pacotes' });
  await expect(list.getByText('Web Design')).toBeVisible();
  await expect(list.getByText('Design Gráfico')).toBeVisible();
  await expect(list.getByText('Logótipo', { exact: true })).toBeVisible();

  const packages = (await (await page.request.get('/api/v1/packages')).json()).data;
  const logo = packages.find((p: { name: string }) => p.name === 'Logótipo');
  expect(logo).toMatchObject({ category: 'grafico', service: 'identidade_visual' });
});

test('dashboard mostra os leads por serviço', async ({ page }) => {
  await page.request.post('/api/v1/leads', { data: { company_name: `Loja Estampas ${run}`, services: ['estampas'] } });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Por serviço' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Leads por serviço de interesse' })).toBeAttached();
});
