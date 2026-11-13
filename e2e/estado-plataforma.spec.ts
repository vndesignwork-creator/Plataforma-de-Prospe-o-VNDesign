import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test } from '@playwright/test';

/*
 * Estado da plataforma: quando correram as tarefas automáticas (cron), a faixa do Dashboard
 * quando param, e os problemas em segundo plano ("Já resolvi").
 */
const run = Date.now().toString(36);

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

type Status = { reminders: string; reminders_at: string | null; problems: { id: string; title: string; resolved_at: string | null; count: number }[] };

test('Tarefas automáticas: a correr, paradas (faixa no Dashboard) e de novo a correr', async ({ page }) => {
  const supabase = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY');
  const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` } });
  const cron = () => page.request.get('/api/v1/cron/reminders', { headers: { Authorization: `Bearer ${localEnv('CRON_SECRET')}` } });
  try {
    expect((await cron()).status()).toBe(200);
    let status = (await (await page.request.get('/api/v1/platform/status')).json()).data as Status;
    expect(status.reminders).toBe('ok');
    expect(status.reminders_at).not.toBeNull();

    // Parou há 3 horas: "Parado" nas Definições e a faixa no Dashboard.
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect((await admin.patch(`${supabase}/rest/v1/platform_status?reminders_at=not.is.null`, { data: { reminders_at: threeHoursAgo } })).status()).toBe(204);
    status = (await (await page.request.get('/api/v1/platform/status')).json()).data as Status;
    expect(status.reminders).toBe('late');
    await page.goto('/');
    const banner = page.getByRole('alert').filter({ hasText: 'As tarefas automáticas não correm há 3 h.' });
    await expect(banner).toBeVisible();
    await banner.getByRole('link', { name: 'Ver o que fazer' }).click();
    await expect(page).toHaveURL(/\/definicoes\/estado$/);
    const tasks = page.getByRole('list', { name: 'Tarefas automáticas' });
    await expect(tasks.getByText('Parado')).toBeVisible();
    await expect(page.getByText('Confirma que estão lá as duas tarefas')).toBeVisible();

    // Volta a correr: a faixa sai.
    expect((await cron()).status()).toBe(200);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/As tarefas automáticas não correm/)).toHaveCount(0);
  } finally {
    // Nunca deixar a base de testes com as tarefas "paradas".
    await admin.patch(`${supabase}/rest/v1/platform_status?reminders_at=not.is.null`, { data: { reminders_at: new Date().toISOString() } });
    await admin.dispose();
  }
});

test('Problemas em segundo plano: aparecem (os repetidos juntam-se) e "Já resolvi"', async ({ page }) => {
  const supabase = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SECRET_KEY');
  const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` } });
  try {
    const members = (await (await admin.get(`${supabase}/rest/v1/workspace_members?select=workspace_id&limit=1`)).json()) as { workspace_id: string }[];
    const report = () =>
      admin.post(`${supabase}/rest/v1/rpc/vnd_report_problem`, {
        data: { p_workspace_id: members[0]!.workspace_id, p_area: 'digest', p_key: `teste-${run}`, p_title: `O resumo diário não saiu ${run}`, p_detail: 'Servidor SMTP recusou.' },
      });
    expect((await report()).status()).toBe(200);
    expect((await report()).status()).toBe(200);
    const status = (await (await page.request.get('/api/v1/platform/status')).json()).data as Status;
    expect(status.problems.find((p) => p.title === `O resumo diário não saiu ${run}`)).toMatchObject({ count: 2, resolved_at: null });

    await page.goto('/definicoes');
    await expect(page.getByRole('link', { name: /Estado da plataforma/ }).first()).toBeVisible();
    await page.goto('/definicoes/estado');
    const list = page.getByRole('list', { name: 'Problemas por resolver' });
    const item = list.getByRole('listitem').filter({ hasText: `O resumo diário não saiu ${run}` });
    await expect(item).toContainText('Resumo diário · 2 vezes');
    await item.getByRole('button', { name: 'Já resolvi' }).click();
    await expect(page.getByText('Marcado como resolvido.')).toBeVisible();
    await expect(list.getByText(`O resumo diário não saiu ${run}`)).toHaveCount(0);
  } finally {
    await admin.dispose();
  }
});
