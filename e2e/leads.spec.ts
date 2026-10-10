import { expect, test, type Page } from '@playwright/test';

// Nomes únicos por execução para os testes poderem correr várias vezes.
const run = Date.now().toString(36);

async function createLead(page: Page, fields: { name: string; city?: string; website?: string; email?: string }) {
  await page.goto('/leads/novo');
  await page.getByLabel('Empresa', { exact: false }).first().fill(fields.name);
  if (fields.city) await page.getByLabel('Cidade').fill(fields.city);
  if (fields.website) await page.getByLabel('Website').fill(fields.website);
  if (fields.email) await page.getByLabel('Email', { exact: true }).fill(fields.email);
}

test('criar lead, abrir a ficha e passar a "Contactado" agenda follow-up', async ({ page }) => {
  const name = `Restaurante Teste ${run}`;
  await createLead(page, { name, city: 'Amadora', website: `teste-${run}.pt`, email: `geral@teste-${run}.pt` });
  await page.getByLabel('Setor').selectOption({ label: 'Restauração' });
  // Os campos menos usados estão em "Mais detalhes" (fechado ao criar).
  await page.locator('summary').filter({ hasText: 'Mais detalhes' }).click();
  await page.getByLabel('Email de prospeção').fill('Boa tarde,\n\nEmail de teste.\n\nCumprimentos');
  await page.getByLabel('Assunto do email').fill('Uma sugestão para o vosso site');
  await page.getByRole('button', { name: 'Criar lead' }).click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Lead criado').first()).toBeVisible();

  await page.getByLabel('Estado').selectOption('contactado');
  await expect(page.getByText(/Follow-up agendado para \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByText('Enviar follow-up ·')).toBeVisible();

  // Copiar o email fica registado na linha do tempo.
  await page.getByRole('button', { name: 'Copiar tudo' }).click();
  await expect(page.getByLabel('Atividade do lead').getByText('Email copiado')).toBeVisible();

  // Nota na linha do tempo
  await page.getByLabel('Texto do registo').fill('Liguei e pediram para enviar por email.');
  await page.getByRole('button', { name: 'Registar' }).click();
  await expect(page.getByLabel('Atividade do lead').getByText('Liguei e pediram para enviar por email.')).toBeVisible();
});

test('aviso de duplicado ao criar e junção com o lead existente', async ({ page }) => {
  const name = `Clínica Duplicada ${run}`;
  await createLead(page, { name, website: `https://www.duplicada-${run}.pt/` });
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Mesmo domínio, nome com maiúsculas/sem acentos diferentes → aviso imediato.
  await createLead(page, { name: `CLINICA DUPLICADA ${run}, LDA`, website: `duplicada-${run}.pt`, city: 'Lisboa' });
  const warning = page.getByRole('status').filter({ hasText: /possíve(l|is) duplicados?/i });
  await expect(warning).toBeVisible();
  await expect(warning.getByText('mesmo website').first()).toBeVisible();
  await expect(warning.getByText('mesmo nome').first()).toBeVisible();

  // Ao gravar, o diálogo propõe juntar.
  await page.getByRole('button', { name: 'Criar lead' }).click();
  const dialog = page.getByRole('dialog', { name: 'Este lead pode já existir' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Juntar com este/ }).first().click();

  await expect(page.getByRole('heading', { name: 'Juntar duplicados' })).toBeVisible();
  // O nome fica o do lead existente; a cidade (vazia no existente) vem do novo registo.
  await expect(page.getByRole('radio', { name: /^Manter #/ }).first()).toBeChecked();
  await page.getByRole('button', { name: 'Confirmar junção' }).click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Lisboa')).toBeVisible();
  await expect(page.getByLabel('Atividade do lead').getByText('Duplicados juntados')).toBeVisible();
});

test('pesquisa e filtros da tabela', async ({ page }) => {
  const name = `Imobiliária Filtro ${run}`;
  await createLead(page, { name, city: 'Sintra' });
  await page.getByLabel('Setor').selectOption({ label: 'Imobiliária' });
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  await page.goto('/leads');
  await page.getByLabel('Pesquisar leads').fill(`imobiliaria filtro ${run}`); // sem acento
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expect(page.getByText(/^1 lead com estes filtros/)).toBeVisible();

  await page.getByRole('group', { name: 'Filtros' }).getByRole('button', { name: 'Estado' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Cliente/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Nenhum lead com estes filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).first().click();
  await expect(page.getByLabel('Pesquisar leads')).toHaveValue('');
});

test('validação do formulário em português', async ({ page }) => {
  await page.goto('/leads/novo');
  await page.getByLabel('Email', { exact: true }).fill('nao-e-um-email');
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByText('Indica o nome da empresa.')).toBeVisible();
  await expect(page.getByText('Email inválido.')).toBeVisible();
});

test('diretório no Website (Sluurpy, TripAdvisor…) passa para Fonte', async ({ page }) => {
  const url = `https://www.sluurpy.com/pt/cabanas/restaurant/${Date.now()}/teste`;
  const created = await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Cabanas Dir ${Date.now()}`, website: url } });
  expect(created.status()).toBe(201);
  const lead = (await created.json()).data;
  expect(lead).toMatchObject({ website: null, source_url: url });

  // Na edição: o mesmo diretório com a Fonte igual fica só na Fonte.
  const patched = await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { website: url } });
  expect((await patched.json()).data).toMatchObject({ website: null, source_url: url });

  // O formulário avisa antes de gravar.
  await page.goto(`/leads/${lead.id}/editar`);
  await page.getByLabel('Website').fill('https://pt.tripadvisor.pt/Restaurant_Review-x');
  await expect(page.getByText('Isto é um diretório (TripAdvisor, Sluurpy, Google Maps…), não o site da empresa')).toBeVisible();
});
