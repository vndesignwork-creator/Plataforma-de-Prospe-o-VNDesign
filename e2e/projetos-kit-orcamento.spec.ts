import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

/*
 * Vários projetos por cliente, kit da marca (com acessos cifrados e partilha
 * com os colaboradores) e calculadora de orçamento.
 */
const run = Date.now().toString(36);

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number; company_name: string };
}

async function anonymous(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test('vários projetos por cliente: projeto novo com os contactos, lista e ligação ao cliente', async ({ page }) => {
  const lead = await createLead(page.request, {
    company_name: `Regressa ${run}`,
    status: 'cliente',
    email: `regressa-${run}@exemplo.pt`,
    phone: '912345678',
    services: ['site_institucional'],
  });

  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#projetos-cliente');
  await card.getByRole('button', { name: 'Novo projeto' }).click();
  const dialog = page.getByRole('dialog', { name: `Novo projeto para Regressa ${run}` });
  await dialog.getByLabel('Nome do projeto').fill('Loja online');
  await dialog.getByLabel('Valor (€)').fill('2.500');
  await dialog.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByText(/Projeto "Loja online" criado/)).toBeVisible();

  // A ficha nova é do projeto: mesmo cliente, contactos copiados e ligação ao principal.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Loja online');
  await expect(page.getByRole('link', { name: /projeto de um cliente que voltou/ })).toBeVisible();
  const family = (await (await page.request.get(`/api/v1/leads/${lead.id}/client-projects`)).json()).data as { main_id: string; projects: { id: string; number: number }[] };
  expect(family.main_id).toBe(lead.id);
  const projectId = family.projects.find((p) => p.id !== lead.id)!.id;
  await expect(page).toHaveURL(new RegExp(`/leads/${family.projects.find((p) => p.id === projectId)!.number}-`));
  const project = (await (await page.request.get(`/api/v1/leads/${projectId}`)).json()).data as Record<string, unknown>;
  expect(project).toMatchObject({ client_of: lead.id, project_title: 'Loja online', status: 'cliente', email: `regressa-${run}@exemplo.pt`, estimated_value: 2500 });

  // Os dois projetos aparecem nas duas fichas.
  const list = page.getByRole('list', { name: 'Projetos do cliente' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await list.getByRole('link', { name: /Primeiro projeto/ }).click();
  await expect(page).toHaveURL(new RegExp(`/leads/${lead.number}-`));
  await expect(page.getByRole('list', { name: 'Projetos do cliente' }).getByRole('link', { name: /Loja online/ })).toBeVisible();

  // A linha do tempo do cliente regista o projeto novo.
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { body: string | null }[];
  expect(activities.some((a) => a.body?.startsWith('Novo projeto: Loja online'))).toBe(true);

  // Um projeto não pode ser "cliente de" si próprio nem de outro projeto: a API usa sempre o principal.
  const again = await page.request.post(`/api/v1/leads/${projectId}/client-projects`, { data: { title: 'Manutenção 2027' } });
  expect(again.status(), await again.text()).toBe(201);
  expect((await again.json()).data.client_of).toBe(lead.id);
});

test('kit da marca: cores, links, ficheiro e acesso cifrado; o colaborador vê só o partilhado', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const lead = await createLead(page.request, { company_name: `Marca ${run}`, status: 'cliente' });

  await page.goto(`/leads/${lead.id}`);
  const card = page.locator('#kit-marca');
  await card.getByRole('button', { name: 'Editar' }).click();
  await card.getByRole('button', { name: 'Cor', exact: true }).click();
  await card.getByLabel('Código da cor 1').fill('EF5C32');
  await card.getByLabel('Nome da cor 1').fill('Laranja');
  await card.getByRole('button', { name: 'Tipo de letra', exact: true }).click();
  await card.getByLabel('Tipo de letra 1', { exact: true }).fill('Plus Jakarta Sans');
  await card.getByRole('button', { name: 'Link', exact: true }).click();
  await card.getByLabel('Nome do link 1').fill('Figma');
  await card.getByLabel('Endereço do link 1').fill('https://figma.com/file/marca');
  await card.getByRole('button', { name: 'Guardar kit' }).click();
  await expect(page.getByText('Kit da marca guardado.')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Cores' })).toContainText('#ef5c32');
  await expect(card.getByRole('list', { name: 'Tipos de letra' })).toContainText('Plus Jakarta Sans');

  // Ficheiro (logótipo).
  await card.locator('input[type="file"]').setInputFiles({ name: 'logotipo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByText('Ficheiro guardado.')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Ficheiros do kit' })).toContainText('logotipo.svg');
  const download = await page.request.get(`/api/v1/leads/${lead.id}/brand-kit/files/0`);
  expect(download.status()).toBe(200);
  expect(await download.text()).toContain('<svg');

  // Acessos: um partilhado com os colaboradores, outro não.
  for (const [label, secret, shared] of [
    ['Alojamento', `Hosting-${run}`, true],
    ['Domínio', `Dominio-${run}`, false],
  ] as const) {
    await card.getByRole('button', { name: 'Acesso', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo acesso' });
    await dialog.getByLabel('O quê').fill(label);
    await dialog.getByLabel('Utilizador ou email').fill(`cliente@marca-${run}.pt`);
    await dialog.getByLabel('Palavra-passe').fill(secret);
    if (shared) await dialog.getByLabel(/Partilhar com os colaboradores/).check();
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
  }
  const accesses = card.getByRole('list', { name: 'Acessos do cliente' });
  await expect(accesses.getByRole('listitem')).toHaveCount(2);
  // A palavra-passe não vem na lista: só ao pedir.
  await expect(accesses).not.toContainText(`Hosting-${run}`);
  await accesses.getByRole('button', { name: 'Mostrar a palavra-passe de Alojamento' }).click();
  await expect(accesses).toContainText(`Hosting-${run}`);
  const list = (await (await page.request.get(`/api/v1/leads/${lead.id}/accesses`)).json()).data as { label: string; has_secret: boolean }[];
  expect(JSON.stringify(list)).not.toContain(`Hosting-${run}`);
  expect(list.every((a) => a.has_secret)).toBe(true);

  // Colaborador do projeto: vê o kit e só o acesso partilhado.
  const email = `colab-marca-${run}@exemplo.pt`;
  const invited = await page.request.post(`/api/v1/leads/${lead.id}/collaborators`, { data: { name: 'Ana Designer', email, send_email: false } });
  expect(invited.status(), await invited.text()).toBe(201);
  const token = ((await invited.json()).data as { collaborator: { token: string } }).collaborator.token;
  const collab = await anonymous(browser);
  try {
    await collab.page.goto(`/convite/${token}`);
    await collab.page.getByLabel('O teu nome').fill('Ana Designer');
    await collab.page.getByLabel('Escolhe uma palavra-passe').fill(`Marca-${run}-pw`);
    await collab.page.getByRole('button', { name: 'Criar conta e aceitar' }).click();
    await expect(collab.page).toHaveURL(/\/colaborador$/);
    await collab.page.goto(`/colaborador/${lead.id}`);
    await expect(collab.page.getByRole('list', { name: 'Cores' })).toContainText('#ef5c32');
    await expect(collab.page.getByRole('list', { name: 'Ficheiros da marca' })).toContainText('logotipo.svg');
    const shared = collab.page.getByRole('list', { name: 'Acessos' });
    await expect(shared.getByRole('listitem')).toHaveCount(1);
    await expect(shared).toContainText('Alojamento');
    await shared.getByRole('button', { name: 'Mostrar' }).click();
    await expect(shared).toContainText(`Hosting-${run}`);

    // O acesso não partilhado não se pede pela API do colaborador.
    const hidden = list.find((a) => a.label === 'Domínio') as unknown as { id: string };
    expect((await collab.page.request.get(`/api/v1/collab/projects/${lead.id}/accesses/${hidden.id}/secret`)).status()).toBe(404);
  } finally {
    await collab.context.close();
  }
});

test('calculadora de orçamento: extras, €/hora, valor estimado e proposta', async ({ page }) => {
  // Extras previsíveis para o teste.
  const saved = await page.request.patch('/api/v1/settings', {
    data: {
      quote: {
        hourly_target: 40,
        extras: [
          { name: 'Página extra', price: 80, kind: 'fixed', unit: 'página', hours: 3, recurring: false },
          { name: 'Urgência', price: 20, kind: 'percent', unit: '', hours: 0, recurring: false },
          { name: 'Manutenção mensal', price: 35, kind: 'fixed', unit: 'mês', hours: 1, recurring: true },
        ],
      },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const lead = await createLead(page.request, { company_name: `Orçamento ${run}` });

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Calcular' }).click();
  const dialog = page.getByRole('dialog', { name: 'Calcular orçamento' });
  // Só os extras, para o total ser previsível.
  for (const box of await dialog.getByRole('group', { name: 'Pacotes' }).getByRole('checkbox').all()) await box.uncheck();
  await dialog.getByLabel('Quantidade: Página extra').fill('2');
  await dialog.getByRole('checkbox', { name: 'Urgência' }).check();
  await dialog.getByLabel('Quantidade: Manutenção mensal').fill('1');
  const result = dialog.getByRole('region', { name: 'Resultado' });
  // 2 × 80 = 160; +20% = 192 €; 6 h → 32 €/h, abaixo dos 40 €/h → sugere 240 €.
  await expect(result).toContainText('192,00');
  await expect(result).toContainText('35,00');
  await expect(result).toContainText('6 h');
  await expect(result).toContainText('32,00');
  await expect(dialog.getByRole('status')).toContainText('240');

  await dialog.getByLabel('Desconto (€)').fill('12');
  await expect(result).toContainText('180,00');
  await dialog.getByRole('button', { name: 'Guardar como valor estimado' }).click();
  await expect(page.getByText(/Valor estimado: 180,00/)).toBeVisible();
  const updated = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { estimated_value: number };
  expect(updated.estimated_value).toBe(180);

  await page.getByRole('button', { name: 'Calcular' }).click();
  for (const box of await dialog.getByRole('group', { name: 'Pacotes' }).getByRole('checkbox').all()) await box.uncheck();
  await dialog.getByLabel('Quantidade: Página extra').fill('2');
  await dialog.getByRole('checkbox', { name: 'Urgência' }).check();
  await dialog.getByRole('button', { name: 'Criar proposta' }).click();
  await expect(page).toHaveURL(/\/propostas\/[0-9a-f-]{36}/);
  const proposals = (await (await page.request.get(`/api/v1/leads/${lead.id}/proposals`)).json()).data as { id: string; total: number }[];
  expect(proposals[0]?.total).toBe(192);
  const proposal = (await (await page.request.get(`/api/v1/proposals/${proposals[0]!.id}`)).json()).data as { items: { name: string; price: number; quantity: number }[] };
  expect(proposal.items.map((i) => [i.name, i.price, i.quantity])).toEqual([
    ['Página extra (2 × página)', 80, 2],
    ['Urgência (+20%)', 32, 1],
  ]);

  // Definições: a calculadora tem o seu cartão em Funcionalidades.
  await page.goto('/definicoes/funcionalidades');
  // O mesmo valor por hora no cartão "Valor por hora" e na calculadora.
  await expect(page.getByLabel('Valor por hora (€)')).toHaveValue('40');
  await expect(page.getByLabel('€ por hora')).toHaveValue('40');
  await expect(page.getByLabel('Nome do extra 1')).toHaveValue('Página extra');
});
