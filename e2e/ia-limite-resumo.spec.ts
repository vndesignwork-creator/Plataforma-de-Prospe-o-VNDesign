import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Inteligência artificial: o modelo de cada função (com quanto se poupava), o limite de gasto
 * mensal (aviso, o automático pára, à mão pergunta) e o resumo da semana por email.
 * IA falsa em e2e/stubs.ts; emails no Mailpit do Supabase local.
 */
const run = Date.now().toString(36);
const MAILPIT = 'http://127.0.0.1:54324/api/v1';
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

async function withAdmin<T>(fn: (admin: APIRequestContext, supabase: string) => Promise<T>): Promise<T> {
  const supabase = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY');
  const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` } });
  try {
    return await fn(admin, supabase);
  } finally {
    await admin.dispose();
  }
}

type Me = { user: { id: string; email: string }; workspace: { id: string } };
// Os pedidos falsos deste ficheiro (para os apagar no fim).
const MARK = { input_tokens: 777_000, output_tokens: 77_000 };

test('Onde usar: cada função escolhe o modelo e vê quanto poupava com um mais barato', async ({ page }) => {
  const me = (await (await page.request.get('/api/v1/me')).json()).data as Me;
  await withAdmin(async (admin, supabase) => {
    try {
      // Resumos do lead com o Opus este mês.
      const rows = Array.from({ length: 3 }, () => ({ feature: 'resumo_lead', cost_usd: 4.62, provider_kind: 'anthropic', model: 'claude-opus-5-5', workspace_id: me.workspace.id, user_id: me.user.id, ...MARK }));
      expect((await admin.post(`${supabase}/rest/v1/ai_usage`, { data: rows })).status()).toBe(201);
      const usage = (await (await page.request.get('/api/v1/ai/usage')).json()).data as { by_function: { key: string; calls: number; cheaper: { model: string; cost_usd: number } | null }[] };
      const summary = usage.by_function.find((f) => f.key === 'summary')!;
      expect(summary.calls).toBeGreaterThanOrEqual(3);
      expect(summary.cheaper?.model).toBe('claude-haiku-5-5');

      await page.goto('/definicoes/ia');
      const row = page.getByRole('region', { name: 'Resumo do lead' });
      // Sem escolha própria: igual ao Email com IA.
      await expect(row.getByLabel('Fornecedor')).toHaveValue('__email__');
      await expect(row.getByTestId('ai-usage-summary')).toContainText('Com claude-haiku-5-5 seria cerca de');
      await row.getByRole('button', { name: 'Usar este modelo' }).click();
      await row.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText(/Resumo do lead: .* guardado\./)).toBeVisible();
      const settings = (await (await page.request.get('/api/v1/settings')).json()).data as { ai: { summary: { model: string } | null } };
      expect(settings.ai.summary?.model).toBe('claude-haiku-5-5');

      // O resumo passa a usar esse modelo.
      const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Modelo ${run}`, status: 'respondeu' } })).json()).data as { id: string };
      const res = await page.request.post(`/api/v1/leads/${lead.id}/summary`);
      expect(res.status(), await res.text()).toBe(200);
      expect((await res.json()).data.model).toBe('claude-haiku-5-5');
      await page.request.delete(`/api/v1/leads/${lead.id}`);

      // De volta a "Igual ao Email com IA".
      await page.reload();
      await row.getByLabel('Fornecedor').selectOption('__email__');
      await row.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText('Resumo do lead: igual ao Email com IA.')).toBeVisible();
    } finally {
      await page.request.patch('/api/v1/settings', { data: { ai: { summary: null } } });
      await admin.delete(`${supabase}/rest/v1/ai_usage?workspace_id=eq.${me.workspace.id}&input_tokens=eq.${MARK.input_tokens}`);
    }
  });
});

test('Limite de gasto mensal: no limite, o que se faz à mão pergunta antes de continuar', async ({ page }) => {
  const me = (await (await page.request.get('/api/v1/me')).json()).data as Me;
  await withAdmin(async (admin, supabase) => {
    try {
      const before = (await (await page.request.get('/api/v1/ai/usage')).json()).data as { budget: { spent_usd: number } };
      // Gasto do mês já acima do limite.
      const row = { feature: 'email', cost_usd: 5, provider_kind: 'anthropic', model: 'claude-opus-5-5', workspace_id: me.workspace.id, user_id: me.user.id, ...MARK };
      expect((await admin.post(`${supabase}/rest/v1/ai_usage`, { data: [row] })).status()).toBe(201);
      const limit = Math.max(1, Math.floor(before.budget.spent_usd + 1));
      expect((await page.request.put('/api/v1/ai/budget', { data: { monthly_usd: limit } })).status()).toBe(200);

      const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Limite ${run}`, status: 'respondeu' } })).json()).data as { id: string; number: number };
      // Pela API: sem confirmação, recusa (com o código para a web perguntar); com o cabeçalho, continua.
      const refused = await page.request.post(`/api/v1/leads/${lead.id}/summary`);
      expect(refused.status()).toBe(409);
      expect((await refused.json()).code).toBe('ai_budget');
      expect((await page.request.post(`/api/v1/leads/${lead.id}/summary`, { headers: { 'X-AI-Budget-Ok': '1' } })).status()).toBe(200);

      // No ecrã: pergunta e, ao confirmar, faz o resumo.
      await page.goto(`/leads/${lead.id}`);
      page.once('dialog', (d) => {
        expect(d.message()).toContain('Continuar mesmo assim?');
        void d.accept();
      });
      await page.getByRole('button', { name: 'Resumo IA' }).click();
      await expect(page.getByRole('dialog', { name: `Resumo de Limite ${run}` }).getByText(/Restaurante em Lisboa sem site/)).toBeVisible();

      // Definições: o limite atingido e o aviso no sino.
      await page.goto('/definicoes/ia');
      await expect(page.getByRole('region', { name: 'Limite de gasto mensal' })).toContainText('Limite atingido');
      const notifications = (await (await page.request.get('/api/v1/notifications')).json()).data as { title: string | null }[];
      expect(notifications.some((n) => n.title?.startsWith('⛔ Chegaste ao limite de gasto da IA'))).toBe(true);

      // Mudar o limite no ecrã.
      const tile = page.getByRole('region', { name: 'Limite de gasto mensal' });
      await tile.getByRole('button', { name: 'Mudar o limite' }).click();
      await tile.getByLabel('Limite de gasto mensal em dólares').fill('5000');
      await tile.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText('Limite de gasto: 5000,00 $ por mês.')).toBeVisible();
      await expect(page.getByTestId('ai-budget')).toContainText('de 5000,00 $');
      expect((await page.request.post(`/api/v1/leads/${lead.id}/summary`)).status()).toBe(200);
      await page.request.delete(`/api/v1/leads/${lead.id}`);
    } finally {
      await page.request.put('/api/v1/ai/budget', { data: { monthly_usd: null } });
      await admin.delete(`${supabase}/rest/v1/ai_usage?workspace_id=eq.${me.workspace.id}&input_tokens=eq.${MARK.input_tokens}`);
    }
  });
});

test('Resumo da semana: enviar agora (números da semana) e desligar', async ({ page }) => {
  const me = (await (await page.request.get('/api/v1/me')).json()).data as Me;
  await page.goto('/definicoes/funcionalidades');
  const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Resumo da semana' }) });
  const started = new Date().toISOString();
  await card.getByRole('button', { name: 'Enviar-me agora (últimos 7 dias)' }).click();
  await expect(page.getByText(`Resumo enviado para ${me.user.email}.`)).toBeVisible({ timeout: 30_000 });
  let found: { ID: string; Subject: string; Created: string } | undefined;
  await expect
    .poll(async () => {
      const res = await page.request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${me.user.email}" subject:"Resumo da semana"`)}`);
      found = (((await res.json()).messages ?? []) as { ID: string; Subject: string; Created: string }[]).find((m) => m.Created >= started.slice(0, 19));
      return !!found;
    }, { timeout: 20_000 })
    .toBe(true);
  expect(found!.Subject).toMatch(/^Resumo da semana — \d{2}\/\d{2} a \d{2}\/\d{2}$/);
  const message = (await (await page.request.get(`${MAILPIT}/message/${found!.ID}`)).json()) as { Text: string };
  for (const part of ['LEADS', 'VENDAS', 'SITES DOS CLIENTES', 'INTELIGÊNCIA ARTIFICIAL (ESTIMATIVA)', 'PROBLEMAS DA PLATAFORMA POR RESOLVER']) expect(message.Text).toContain(part);

  // Desligar e voltar a ligar.
  try {
    await card.getByRole('switch', { name: 'Desligar o resumo da semana' }).click();
    await expect(page.getByText('Resumo da semana desligado.')).toBeVisible();
    expect((await (await page.request.get('/api/v1/settings')).json()).data.weekly_report.enabled).toBe(false);
  } finally {
    await page.request.patch('/api/v1/settings', { data: { weekly_report: { enabled: true } } });
  }
});
