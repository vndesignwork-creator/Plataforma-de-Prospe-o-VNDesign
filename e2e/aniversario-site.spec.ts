import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test } from '@playwright/test';

/*
 * Aniversário do site: um ano depois da entrega fica uma tarefa (e um aviso),
 * e na ficha há o email de aniversário já escrito.
 */
const run = Date.now().toString(36);

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

/** Há N anos, mais uns dias (para o aniversário cair já a seguir). */
function yearsAgo(years: number, plusDays: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString();
}

test('aniversário do site: tarefa pelo cron e email pronto na ficha', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { projects: true, site_anniversary: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Aniversário ${run}`, contact_name: 'Ana', status: 'cliente' },
  })).json()).data as { id: string };

  try {
    // Entregue há quase um ano: o aniversário é daqui a 3 dias (a tarefa aparece 7 dias antes).
    await page.request.post(`/api/v1/leads/${lead.id}/project`, { data: { completed: true, portfolio_task: false } });
    const key = localEnv('SUPABASE_SECRET_KEY');
    const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' } });
    try {
      const patched = await admin.patch(`${localEnv('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/leads?id=eq.${lead.id}`, {
        data: { project_completed_at: yearsAgo(1, 3) },
      });
      expect(patched.status(), await patched.text()).toBeLessThan(300);
    } finally {
      await admin.dispose();
    }

    const cron = await page.request.get('/api/v1/cron/daily-digest', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(cron.status(), await cron.text()).toBe(200);
    const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; due_on: string | null }[];
    expect(tasks.find((t) => t.title.startsWith('Aniversário do site:'))?.title).toBe(`Aniversário do site: 1 ano (Aniversário ${run})`);

    // Correr outra vez não cria uma segunda tarefa.
    await page.request.get('/api/v1/cron/daily-digest', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const again = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string }[];
    expect(again.filter((t) => t.title.startsWith('Aniversário do site:'))).toHaveLength(1);

    // Na ficha: o email de aniversário já escrito.
    await page.goto(`/leads/${lead.id}`);
    await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: /^Cliente/ }).click();
    const section = page.getByRole('region', { name: 'Aniversário do site' });
    await expect(section).toContainText('faz 1 ano');
    await section.getByRole('button', { name: 'Email de aniversário' }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`Email de aniversário · Aniversário ${run}`) });
    await expect(dialog.getByLabel('Assunto')).toHaveValue(`O site da Aniversário ${run} faz 1 ano`);
    await page.keyboard.press('Escape');
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
