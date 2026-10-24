import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
// Servidor IMAP de teste (em memória): faz de caixa de entrada do Gmail.
import hoodiecrow from 'hoodiecrow-imap';
import { ImapFlow } from 'imapflow';

/*
 * Prioridade dos leads, sequência de follow-ups por email e deteção de respostas.
 * Envio: Mailpit do Supabase local (SMTP 127.0.0.1:54325, API :54324).
 * Caixa de entrada: hoodiecrow-imap em 127.0.0.1:1143 (utilizador "teste").
 */
const run = Date.now().toString(36);
const FROM = `va+seq${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';
const IMAP_PORT = 1143;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
// Os follow-ups automáticos não caem ao fim de semana: sábado e domingo passam para segunda.
const workday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const shift = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 1 : 0;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
};
const plusDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

let imap: { close: (cb?: () => void) => void } | null = null;

test.beforeAll(async () => {
  imap = hoodiecrow({
    plugins: ['ID', 'IDLE', 'ENABLE', 'UNSELECT', 'NAMESPACE', 'LITERALPLUS', 'SPECIAL-USE', 'XTOYBIRD'],
    users: { teste: { password: 'segredo' } },
    storage: { INBOX: { messages: [] } },
  });
  await new Promise<void>((resolve) => (imap as unknown as { listen: (p: number, cb: () => void) => void }).listen(IMAP_PORT, resolve));
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.request.delete('/api/v1/mail-account');
  await page.close();
  imap?.close();
});

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data;

async function connectAccount(page: Page) {
  const res = await page.request.put('/api/v1/mail-account', {
    data: {
      provider: 'custom',
      from_name: 'Va Teste',
      from_email: FROM,
      smtp_host: '127.0.0.1',
      smtp_port: 54325,
      smtp_secure: false,
      reply_detection: true,
      imap_host: '127.0.0.1',
      imap_port: IMAP_PORT,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Põe um email na caixa de entrada de teste. */
async function deliverToInbox(from: string, subject: string, extraHeaders = '') {
  const client = new ImapFlow({ host: '127.0.0.1', port: IMAP_PORT, secure: false, auth: { user: 'teste', pass: 'segredo' }, logger: false });
  await client.connect();
  const raw =
    `From: Cliente <${from}>\r\nTo: ${FROM}\r\nSubject: ${subject}\r\n` +
    `Message-ID: <${Math.random().toString(36).slice(2)}@teste>\r\nDate: ${new Date().toUTCString()}\r\n${extraHeaders}\r\nObrigado, interessa-nos.`;
  await client.append('INBOX', raw);
  await client.logout();
}

test('prioridade: pontuação com razões, ordenar por prioridade e “Leads mais quentes” no Dashboard', async ({ page }) => {
  const sectors = (await (await page.request.get('/api/v1/sectors')).json()).data as { id: string; name: string; priority_rank: number | null }[];
  const top = sectors.find((s) => s.priority_rank === 1)!;
  const hot = await createLead(page.request, {
    company_name: `Hotel Quente ${run}`,
    sector_id: top.id,
    email: `geral@hotel-${run}.pt`,
    estimated_value: 1500,
    status: 'respondeu',
  });
  // Respondeu 25 + sem site 25 + email 10 + setor prioritário 10 + valor ≥ 1000 € 10.
  expect(hot.score).toBe(80);
  expect(hot.score_reasons).toEqual(['Respondeu', 'Sem site próprio', 'Tem email', 'Setor prioritário', 'Valor estimado ≥ 1000 €']);
  const cold = await createLead(page.request, { company_name: `Loja Fria ${run}`, website: `https://loja-${run}.pt`, mobile: 'sim' });
  expect(cold.score).toBe(0);

  // Muda sozinha: com um site rápido e adaptado, deixa de contar "Sem site próprio".
  await page.request.patch(`/api/v1/leads/${hot.id}`, { data: { website: `https://hotel-${run}.pt`, mobile: 'nao' } });
  const updated = await getLead(page.request, hot.id);
  expect(updated.score_reasons).toContain('Site não funciona no telemóvel');
  expect(updated.score_reasons).not.toContain('Sem site próprio');
  // A pontuação não aparece na linha do tempo como "Lead editado (Prioridade)".
  const activity = (await (await page.request.get(`/api/v1/leads/${hot.id}/activities`)).json()).data as { type: string; payload: { fields?: string[] } }[];
  expect(activity.flatMap((a) => a.payload.fields ?? [])).not.toContain('score');

  const sorted = (await (await page.request.get('/api/v1/leads', { params: { q: run, sort: 'score', order: 'desc' } })).json()).data as { id: string }[];
  expect(sorted.map((l) => l.id).indexOf(hot.id)).toBeLessThan(sorted.map((l) => l.id).indexOf(cold.id));

  await page.goto('/dashboard');
  const card = page.getByRole('list', { name: 'Leads mais quentes' });
  await expect(card.getByRole('link', { name: new RegExp(`Hotel Quente ${run}`) })).toBeVisible();

  await page.goto(`/leads/${hot.id}`);
  await page.getByRole('button', { name: /Prioridade \d+ de 100/ }).click();
  await expect(page.getByText('Site não funciona no telemóvel')).toBeVisible();
});

test('sequência: o 1.º email agenda o follow-up 1; “Enviar follow-up” responde na mesma conversa e agenda o 2.º', async ({ page }) => {
  await connectAccount(page);
  const to = `cliente@seq-${run}.pt`;
  const subject = `Uma ideia para a Padaria ${run}`;
  const lead = await createLead(page.request, {
    company_name: `Padaria Sequência ${run}`,
    email: to,
    email_subject: subject,
    email_body: 'Boa tarde,\n\nTenho uma ideia para o vosso site.\n\nCumprimentos,',
  });

  const first = await page.request.post(`/api/v1/leads/${lead.id}/email`, { data: { to, subject, body: 'Boa tarde,\n\nUma ideia.' } });
  expect(first.status(), await first.text()).toBe(200);
  let current = await getLead(page.request, lead.id);
  expect(current).toMatchObject({
    status: 'contactado',
    next_action_text: 'Follow-up 1 de 3 por email',
    next_action_on: plusDays(today(), 3),
    follow_up_count: 0,
  });

  const draft = (await (await page.request.get(`/api/v1/leads/${lead.id}/follow-up-draft`)).json()).data;
  expect(draft).toMatchObject({ step: 1, total: 3, to, subject: `Re: ${subject}` });
  expect(draft.in_reply_to).toMatch(/^<.+>$/);
  expect(draft.body.length).toBeGreaterThan(20);

  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Enviar follow-up', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Enviar follow-up 1 de 3' });
  await expect(dialog.getByLabel('Assunto')).toHaveValue(`Re: ${subject}`);
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(new RegExp(`Follow-up 1 enviado para ${to}\\. Próximo: Follow-up 2 de 3 por email a`))).toBeVisible();

  current = await getLead(page.request, lead.id);
  expect(current).toMatchObject({ follow_up_count: 1, last_follow_up_on: today(), next_action_text: 'Follow-up 2 de 3 por email', next_action_on: workday(plusDays(today(), 7)) });
  await expect(page.getByLabel('Atividade do lead').getByText('Follow-up 1 enviado por email ✓')).toBeVisible();

  // O follow-up chegou como resposta ao primeiro email (o cliente de email junta-os na mesma conversa).
  let followUp: { ID: string } | undefined;
  await expect
    .poll(async () => {
      const res = await page.request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}" subject:"Re: ${subject}"`)}`);
      followUp = ((await res.json()).messages ?? [])[0];
      return !!followUp;
    })
    .toBe(true);
  const headers = (await (await page.request.get(`${MAILPIT}/message/${followUp!.ID}/headers`)).json()) as Record<string, string[]>;
  expect(headers['In-Reply-To']?.[0]).toBe(draft.in_reply_to);
});

test('respostas: “Verificar agora” lê a caixa de entrada, passa o lead a Respondeu e não conta duas vezes', async ({ page }) => {
  await connectAccount(page);
  // A palavra-passe da caixa de entrada de teste (o SMTP do Mailpit não a pede).
  const save = await page.request.put('/api/v1/mail-account', {
    data: {
      provider: 'custom', from_name: 'Va Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false,
      smtp_user: 'teste', password: 'segredo', reply_detection: true, imap_host: '127.0.0.1', imap_port: IMAP_PORT,
    },
  });
  expect(save.status()).toBe(200);
  const domain = `resposta-${run}.pt`;
  const lead = await createLead(page.request, { company_name: `Oficina Responde ${run}`, email: `geral@${domain}`, status: 'contactado' });
  expect(lead.next_action_on).not.toBeNull();

  await deliverToInbox(`joao@${domain}`, `Re: Uma ideia para a Oficina ${run}`); // mesmo domínio de empresa
  await deliverToInbox(`geral@${domain}`, 'Resposta automática: estamos de férias', 'Auto-Submitted: auto-replied\r\n');
  await deliverToInbox(`alguem-${run}@gmail.com`, 'Promoção'); // não é de nenhum lead

  await page.goto('/definicoes/email');
  await expect(page.getByText('Respostas dos leads')).toBeVisible();
  await page.getByRole('button', { name: 'Verificar agora' }).click();
  await expect(page.getByText(`1 resposta nova: Oficina Responde ${run}.`)).toBeVisible();
  await expect(page.getByText(/Última leitura: \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  const updated = await getLead(page.request, lead.id);
  expect(updated).toMatchObject({ status: 'respondeu', next_action_text: 'Responder ao cliente', next_action_on: today() });
  const activity = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as {
    type: string;
    payload: { auto?: boolean; from?: string };
  }[];
  const received = activity.filter((a) => a.type === 'email_received');
  expect(received).toHaveLength(2);
  expect(received.filter((a) => a.payload.auto)).toHaveLength(1);

  // Segunda leitura: nada de novo.
  const again = (await (await page.request.post('/api/v1/mail-account/check-replies')).json()).data;
  expect(again).toEqual({ checked: 0, replies: [] });

  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByLabel('Atividade do lead').getByText(`De joao@${domain}`)).toBeVisible();

  // Palavra-passe errada: o erro fica visível nas definições.
  await page.request.put('/api/v1/mail-account', {
    data: {
      provider: 'custom', from_name: 'Va Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false,
      smtp_user: 'teste', password: 'errada', reply_detection: true, imap_host: '127.0.0.1', imap_port: IMAP_PORT,
    },
  });
  const refused = await page.request.post('/api/v1/mail-account/check-replies');
  expect(refused.status()).toBe(422);
  await page.goto('/definicoes/email');
  await expect(page.getByText(/Última leitura falhou: Utilizador ou palavra-passe recusados/)).toBeVisible();
});
