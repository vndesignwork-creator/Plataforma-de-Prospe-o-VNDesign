import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test } from '@playwright/test';

/*
 * Leads que voltam ao teu site: o link do email leva ?vnd=<código> quando vai
 * para um site com o plugin; o plugin avisa e a visita fica na linha do tempo.
 */
const run = Date.now().toString(36);
const SITE = `https://site-${Date.now().toString(36)}.pt`;

function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

test('visitas ao site: o código no link e o aviso do plugin', async ({ page }) => {
  test.setTimeout(120_000);
  await page.request.patch('/api/v1/settings', { data: { features: { site_visits: true, email_tracking: true } } });
  const me = (await (await page.request.get('/api/v1/me')).json()).data as { user: { id: string }; workspace: { id: string } };
  const settings = (await (await page.request.get('/api/v1/settings')).json()).data as { free_audit: { token: string | null } };
  const siteToken = settings.free_audit.token;
  expect(siteToken, 'a análise grátis tem de ter código (Definições → Formulário do site)').toBeTruthy();

  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Visita ${run}`, email: `geral@visita-${run}.pt`, status: 'contactado' },
  })).json()).data as { id: string };

  const key = localEnv('SUPABASE_SECRET_KEY');
  const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } });
  const supabase = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  try {
    // O site onde o plugin está instalado e um email já enviado a este lead.
    await admin.post(`${supabase}/rest/v1/free_audit_plugin_sites`, {
      data: { workspace_id: me.workspace.id, site: SITE, version: '1.11.0', seen_at: new Date().toISOString() },
    });
    const token = `tok${run}${'x'.repeat(20)}`.slice(0, 40);
    const tracking = await admin.post(`${supabase}/rest/v1/email_tracking`, {
      data: {
        workspace_id: me.workspace.id,
        lead_id: lead.id,
        token,
        subject: `Uma ideia para o site ${run}`,
        links: [`${SITE}/precos`],
        created_by: me.user.id,
        sent_at: new Date(Date.now() - 600_000).toISOString(),
      },
    });
    expect(tracking.status(), await tracking.text()).toBe(201);

    // O clique no link leva o código (para o site saber quem é quando voltar).
    const click = await page.request.get(`/api/v1/public/t/${token}/0`, { maxRedirects: 0, headers: { 'user-agent': 'Mozilla/5.0 (Lead)' } });
    expect(click.status()).toBe(302);
    expect(click.headers()['location']).toBe(`${SITE}/precos?vnd=${token}`);

    // O plugin avisa: a visita fica na linha do tempo.
    const visit = await page.request.post(`/api/v1/public/visits/${siteToken}`, {
      data: { lead: token, page: `${SITE}/precos?vnd=${token}`, referrer: null },
    });
    expect(visit.status()).toBe(204);
    const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string; body: string | null; payload: Record<string, unknown> }[];
    const seen = activities.find((a) => a.type === 'site_visit');
    expect(seen?.body).toBe('/precos?vnd=' + token);
    expect(seen?.payload.from_email).toBe(`Uma ideia para o site ${run}`);

    // Um código inválido não regista nada (e responde na mesma).
    const bogus = await page.request.post(`/api/v1/public/visits/${siteToken}`, { data: { lead: 'x'.repeat(20), page: `${SITE}/` } });
    expect(bogus.status()).toBe(204);
    const after = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string }[];
    expect(after.filter((a) => a.type === 'site_visit')).toHaveLength(1);
  } finally {
    await admin.delete(`${supabase}/rest/v1/free_audit_plugin_sites?workspace_id=eq.${me.workspace.id}&site=eq.${encodeURIComponent(SITE)}`).catch(() => undefined);
    await admin.dispose();
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
