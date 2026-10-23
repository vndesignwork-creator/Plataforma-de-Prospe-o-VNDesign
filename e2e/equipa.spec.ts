import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser } from '@playwright/test';

/*
 * Equipa de prospeção: convidar um prospetor, aceitar, o que ele vê e não vê
 * (páginas, API e valores), responsável dos leads, fila da Prospeção, limite
 * semanal do gerador, Estatísticas → Equipa e remover da equipa.
 */
const run = Date.now().toString(36);

function localEnv(name: string): string | undefined {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number; company_name: string; assigned_to: string | null; estimated_value?: number | null };
}

async function anonymous(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test('equipa: convidar um prospetor, o que vê, responsável, limite do gerador e remover', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const email = `prospetor-${run}@exemplo.pt`;
  const name = `Paula ${run}`;
  const lead = await createLead(page.request, { company_name: `Equipa Valor ${run}`, status: 'identificado', estimated_value: 7777 });

  // Dono: menu Equipa → Convidar → "Ajudar com leads" (link copiado, sem email).
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Principal' }).first().getByRole('link', { name: 'Equipa' }).click();
  await expect(page).toHaveURL(/\/equipa$/);
  await expect(page.getByRole('tab', { name: /Prospeção/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Convidar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Convidar' });
  await expect(dialog.getByRole('radio', { name: /Ajudar com leads/ })).toBeChecked();
  await expect(dialog.getByRole('combobox', { name: /^Papel/ })).toHaveValue('prospector');
  await dialog.getByRole('textbox', { name: /^Nome/ }).fill(name);
  await dialog.getByRole('textbox', { name: /^Email/ }).fill(email);
  await dialog.getByLabel('Enviar o convite por email').uncheck();
  await dialog.getByRole('button', { name: 'Convidar' }).click();
  await expect(page.getByText(/Convite criado/)).toBeVisible();
  await expect(page.getByText(`${email} · convite por aceitar · Prospetor`)).toBeVisible();
  const team = (await (await page.request.get('/api/v1/team')).json()).data as { invites: { email: string; token: string }[] };
  const invite = team.invites.find((i) => i.email === email)!;

  const p = await anonymous(browser);
  let userId: string | undefined;
  try {
    // Aceitar: cria a conta e entra no Dashboard do prospetor.
    await p.page.goto(`/equipa/${invite.token}`);
    await expect(p.page.getByRole('heading', { name: 'Convite para a equipa' })).toBeVisible();
    await p.page.getByLabel('O teu nome').fill(name);
    await p.page.getByLabel('Escolhe uma palavra-passe').fill(`Equipa-${run}-pw`);
    await p.page.getByRole('button', { name: 'Criar conta e aceitar' }).click();
    await expect(p.page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(p.page.getByRole('region', { name: 'O meu trabalho' }).getByText('Contactos hoje')).toBeVisible();
    const me = (await (await p.page.request.get('/api/v1/me')).json()).data as { user: { id: string }; role: string };
    userId = me.user.id;
    expect(me.role).toBe('prospector');

    // Menu: só a parte comercial; páginas fechadas levam à Prospeção.
    const nav = p.page.getByRole('navigation', { name: 'Principal' }).first();
    await expect(nav.getByRole('link', { name: 'Prospeção' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Projetos' })).toHaveCount(0);
    await p.page.goto('/projetos');
    await expect(p.page).toHaveURL(/\/prospecao$/);

    // API: 403 no que não é para ele; nunca recebe valores.
    for (const path of ['/api/v1/projects', '/api/v1/dashboard', '/api/v1/leads/export', '/api/v1/team', `/api/v1/leads/${lead.id}/payments`]) {
      expect((await p.page.request.get(path)).status(), path).toBe(403);
    }
    expect((await p.page.request.delete(`/api/v1/leads/${lead.id}`)).status()).toBe(403);
    const seen = (await (await p.page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as Record<string, unknown>;
    expect(seen).not.toHaveProperty('estimated_value');

    // Ficha do lead: sem valor nem propostas.
    await p.page.goto(`/leads/${lead.id}`);
    await expect(p.page.getByRole('heading', { name: `Equipa Valor ${run}` })).toBeVisible();
    await expect(p.page.getByText('Responsável')).toBeVisible();
    await expect(p.page.getByText('Valor estimado')).toHaveCount(0);
    await expect(p.page.getByText(/7\s?777/)).toHaveCount(0);
    await expect(p.page.getByRole('heading', { name: 'Propostas' })).toHaveCount(0);

    // Um lead criado pelo prospetor fica dele (e sem valor).
    const own = await createLead(p.page.request, { company_name: `Equipa Própria ${run}`, status: 'identificado', estimated_value: 500 });
    expect(own.assigned_to).toBe(userId);
    expect(own.estimated_value).toBeUndefined();
    expect((await (await page.request.get(`/api/v1/leads/${own.id}`)).json()).data.estimated_value).toBeNull();

    // Fila da Prospeção: só os leads dele.
    const queue = async () =>
      ((await (await p.page.request.get('/api/v1/prospecting')).json()).data as { items: { lead: { id: string } }[] }).items.map((i) => i.lead.id);
    expect(await queue()).toContain(own.id);
    expect(await queue()).not.toContain(lead.id);

    // Dono: atribuir em conjunto na lista de leads.
    await page.goto(`/leads?q=${encodeURIComponent(`Equipa Valor ${run}`)}`);
    await page.getByRole('checkbox', { name: `Selecionar #${lead.number} Equipa Valor ${run}` }).first().check();
    await page.getByRole('button', { name: 'Atribuir a…' }).click();
    await page.getByRole('menuitem', { name }).click();
    await expect(page.getByText('1 lead atribuído.')).toBeVisible();
    expect(await queue()).toContain(lead.id);
    const mine = (await (await p.page.request.get('/api/v1/leads?assigned=me&limit=100')).json()).data as { id: string }[];
    expect(mine.map((l) => l.id)).toEqual(expect.arrayContaining([lead.id, own.id]));
    // O prospetor não muda o responsável.
    await p.page.request.patch(`/api/v1/leads/${lead.id}`, { data: { assigned_to: null } });
    expect((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data.assigned_to).toBe(userId);

    // Ficha (dono): o Responsável escolhe-se na própria ficha.
    await page.goto(`/leads/${lead.id}`);
    await expect(page.getByRole('combobox', { name: 'Responsável' })).toHaveValue(userId);

    // Estatísticas → Equipa: o dono vê cada pessoa; o prospetor só a sua linha.
    await page.goto('/estatisticas');
    await expect(page.getByRole('heading', { name: 'Equipa', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('cell', { name: new RegExp(name) })).toBeVisible();
    await p.page.goto('/estatisticas');
    const rows = p.page.getByRole('table', { name: 'Trabalho de cada pessoa da equipa' }).locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(name);

    // Limite semanal do gerador (0 = sem gerador para os prospetores).
    // (o endereço antigo, Definições → Equipa, leva à página nova)
    await page.goto('/definicoes/equipa');
    await expect(page).toHaveURL(/\/equipa$/);
    await page.getByLabel('Leads por semana, por prospetor').fill('0');
    await page.getByRole('button', { name: 'Guardar limite' }).click();
    await expect(page.getByText('Limite guardado.')).toBeVisible();
    const blocked = await p.page.request.post('/api/v1/lead-generation', { data: { query: `padarias equipa ${run}` } });
    expect(blocked.status()).toBe(422);
    expect(await blocked.text()).toContain('Limite semanal atingido');
    await p.page.goto('/gerar-leads');
    await expect(p.page.getByText(/Chegaste ao limite desta semana/)).toBeVisible();
    await expect(p.page.getByRole('button', { name: 'Repetir todas as semanas' })).toHaveCount(0);

    // Remover da equipa: perde logo o acesso e os leads ficam sem responsável.
    await page.reload();
    await page.getByRole('button', { name: `Remover ${name} da equipa` }).click();
    await page.getByRole('button', { name: 'Sim' }).click();
    await expect(page.getByText('Removido da equipa: já não tem acesso.')).toBeVisible();
    expect((await p.page.request.get('/api/v1/leads')).status()).not.toBe(200);
    expect((await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data.assigned_to).toBeNull();
  } finally {
    await page.request.patch('/api/v1/settings', { data: { team: { generation_weekly_limit: 50 } } });
    await p.context.close();
    if (userId) {
      const url = localEnv('NEXT_PUBLIC_SUPABASE_URL')!;
      const key = localEnv('SUPABASE_SECRET_KEY')!;
      const admin = await playwrightRequest.newContext();
      await admin.delete(`${url}/auth/v1/admin/users/${userId}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      await admin.dispose();
    }
  }
});
