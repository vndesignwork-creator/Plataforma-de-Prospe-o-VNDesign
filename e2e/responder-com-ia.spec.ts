import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Responder com IA às respostas dos leads: a partir do que o lead escreveu, a IA
 * escreve a resposta (nada é enviado sozinho). IA falsa em e2e/stubs.ts.
 */
const run = Date.now().toString(36);
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

test('resposta ao lead escrita pela IA (pela API e na ficha)', async ({ page }) => {
  test.setTimeout(120_000);
  const lead = (await (await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Padaria Resposta ${run}`, status: 'respondeu', contact_name: 'Ana', email_subject: 'O site da padaria no telemóvel' },
  })).json()).data as { id: string };

  try {
    // Pela API: assunto com "Re:", assinatura no fim e o que o lead disse em uma frase.
    const res = await page.request.post(`/api/v1/leads/${lead.id}/ai-reply`, {
      data: { text: 'Bom dia, quanto custa um site destes?', subject: 'O site da padaria no telemóvel', goal: 'preco' },
    });
    expect(res.status(), await res.text()).toBe(200);
    const draft = (await res.json()).data as { subject: string; body: string; summary: string; tip: string | null; model: string };
    expect(draft.subject).toBe('Re: O site da padaria no telemóvel');
    expect(draft.body).toContain('Obrigado pela resposta.');
    expect(draft.summary).toBe('Perguntou o preço.');
    expect(draft.model).toBeTruthy();

    // Texto vazio: recusado com erro de validação (não se pede nada à IA).
    const empty = await page.request.post(`/api/v1/leads/${lead.id}/ai-reply`, { data: { text: '' } });
    expect(empty.status()).toBe(400);

    // Ficou registado na linha do tempo.
    const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { type: string }[];
    expect(activities.some((a) => a.type === 'ai_reply_generated')).toBe(true);

    // Na ficha: a resposta do lead traz o botão "Responder com IA".
    const me = (await (await page.request.get('/api/v1/me')).json()).data as { user: { id: string }; workspace: { id: string } };
    const key = localEnv('SUPABASE_SECRET_KEY');
    const admin = await playwrightRequest.newContext({ extraHTTPHeaders: { apikey: key, Authorization: `Bearer ${key}` } });
    try {
      const inserted = await admin.post(`${localEnv('NEXT_PUBLIC_SUPABASE_URL')}/rest/v1/lead_activities`, {
        data: {
          workspace_id: me.workspace.id,
          lead_id: lead.id,
          type: 'email_received',
          body: 'Pedido de orçamento',
          payload: { via: 'inbox', from: 'ana@padaria.pt', subject: 'Pedido de orçamento', text: 'Bom dia, tenho agenda só em março. Quanto custa?' },
          actor_user_id: me.user.id,
        },
      });
      expect(inserted.status(), await inserted.text()).toBe(201);
    } finally {
      await admin.dispose();
    }

    await page.goto(`/leads/${lead.id}`);
    await page.getByRole('button', { name: 'Responder com IA' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Responder com IA' });
    // O texto do email já lá está (foi guardado quando a resposta chegou).
    await expect(dialog.getByLabel('O que o lead escreveu')).toHaveValue(/tenho agenda só em março/);
    await dialog.getByRole('button', { name: 'Escrever resposta' }).click();
    await expect(dialog.getByText('Perguntou pela agenda.')).toBeVisible();
    await expect(dialog.getByLabel('Assunto')).toHaveValue('Re: Pedido de orçamento');
    await expect(dialog.getByLabel('Resposta')).toHaveValue(/Obrigado pela resposta/);
    await expect(dialog.getByRole('button', { name: 'Rever e enviar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/leads/${lead.id}`);
  }
});
