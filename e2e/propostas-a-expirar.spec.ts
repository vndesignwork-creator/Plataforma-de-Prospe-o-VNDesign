import { expect, test } from '@playwright/test';

/*
 * Propostas a perder a validade: selo na ficha ("Validade termina hoje" /
 * "Validade terminou ontem") e botão para prolongar a validade.
 */
const run = Date.now().toString(36);
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('proposta a expirar: selo na ficha e prolongar a validade', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { proposal_expiry: true } } });
  const lead = (await (await page.request.post('/api/v1/leads?force=true', { data: { company_name: `Validade ${run}` } })).json()).data as { id: string };
  const created = await page.request.post(`/api/v1/leads/${lead.id}/proposals`, {
    data: {
      title: `Site a expirar ${run}`,
      items: [{ name: 'Site', price: 1000, quantity: 1, features: [] }],
      valid_until: iso(0),
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const proposal = (await created.json()).data as { id: string; code: string };

  try {
    // Rascunho: ainda não diz nada (só conta depois de enviada).
    await page.goto(`/leads/${lead.id}`);
    await expect(page.getByText('Validade termina hoje')).toHaveCount(0);

    await page.request.patch(`/api/v1/proposals/${proposal.id}`, { data: { status: 'enviada' } });
    await page.reload();
    await expect(page.getByText('Validade termina hoje')).toBeVisible();

    // Prolongar mais 14 dias: o selo desaparece e a validade muda.
    await page.getByRole('button', { name: `Prolongar a validade da proposta ${proposal.code}` }).click();
    await page.getByRole('menuitem', { name: /^Mais 14 dias/ }).click();
    await expect(page.getByText('Validade termina hoje')).toHaveCount(0);
    const saved = (await (await page.request.get(`/api/v1/proposals/${proposal.id}`)).json()).data as { valid_until: string };
    expect(saved.valid_until).toBe(iso(14));

    // Validade já passada: selo vermelho.
    await page.request.patch(`/api/v1/proposals/${proposal.id}`, { data: { valid_until: iso(-1) } });
    await page.reload();
    await expect(page.getByText('Validade terminou ontem')).toBeVisible();

    // O trabalho diário avisa uma vez (e não repete no dia seguinte).
    const cron = await page.request.get('/api/v1/cron/daily-digest', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(cron.status(), await cron.text()).toBe(200);
    const avisos = async () => {
      const body = (await (await page.request.get('/api/v1/notifications')).json()) as { data: { title: string | null }[] };
      return body.data.filter((n) => (n.title ?? '').includes(proposal.code));
    };
    expect(await avisos()).toHaveLength(1);
    await page.request.get('/api/v1/cron/daily-digest', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(await avisos()).toHaveLength(1);
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
