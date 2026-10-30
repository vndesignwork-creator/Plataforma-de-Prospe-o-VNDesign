import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
// Servidor IMAP de teste (em memória): faz de caixa de entrada do Gmail.
import hoodiecrow from 'hoodiecrow-imap';
import { ImapFlow } from 'imapflow';

/*
 * Emails devolvidos, respostas "sem interesse" / "removam-me", ausências,
 * verificação do email, estatísticas por modelo e horário de silêncio.
 * Envio: Mailpit do Supabase local; caixa de entrada: hoodiecrow-imap em 127.0.0.1:1144.
 */
const run = Date.now().toString(36);
const FROM = `va+dev${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';
const IMAP_PORT = 1144;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const plusDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const workday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const shift = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 1 : 0;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
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
  await page.request.put(`/api/v1/preferences/notifications.quiet`, { data: { value: { enabled: false } } });
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
      provider: 'custom', from_name: 'Va Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false,
      smtp_user: 'teste', password: 'segredo', reply_detection: true, imap_host: '127.0.0.1', imap_port: IMAP_PORT,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Põe um email (texto simples) na caixa de entrada de teste. */
async function deliverToInbox(from: string, subject: string, body: string, extraHeaders = '') {
  const client = new ImapFlow({ host: '127.0.0.1', port: IMAP_PORT, secure: false, auth: { user: 'teste', pass: 'segredo' }, logger: false });
  await client.connect();
  const raw =
    `From: ${from}\r\nTo: ${FROM}\r\nSubject: ${subject}\r\n` +
    `Message-ID: <${Math.random().toString(36).slice(2)}@teste>\r\nDate: ${new Date().toUTCString()}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n${extraHeaders}\r\n${body}`;
  await client.append('INBOX', raw);
  await client.logout();
}

async function mailHtml(request: APIRequestContext, address: string, subject: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        id = (((await res.json()).messages ?? []) as { ID: string; Subject: string }[]).find((m) => m.Subject === subject)?.ID;
        return !!id;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return ((await (await request.get(`${MAILPIT}/message/${id}`)).json()) as { HTML: string }).HTML;
}

test('devolvido, sem interesse, removam-me e ausência: o que muda em cada lead', async ({ page }) => {
  await connectAccount(page);
  const bounced = await createLead(page.request, { company_name: `Devolvido ${run}`, email: `ninguem@devolve-${run}.pt`, status: 'contactado' });
  const declined = await createLead(page.request, { company_name: `Sem Interesse ${run}`, email: `geral@recusa-${run}.pt`, status: 'contactado' });
  const removed = await createLead(page.request, { company_name: `Removam ${run}`, email: `geral@remove-${run}.pt`, status: 'contactado' });
  const away = await createLead(page.request, { company_name: `Ausente ${run}`, email: `geral@ferias-${run}.pt`, status: 'contactado' });
  const back = plusDays(today(), 10);
  const [y, m, d] = back.split('-');

  await deliverToInbox(
    'Mail Delivery System <MAILER-DAEMON@mail.vndesign.pt>',
    'Undelivered Mail Returned to Sender',
    `This is the mail system.\r\n\r\nFinal-Recipient: rfc822; ninguem@devolve-${run}.pt\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 User unknown\r\n`,
  );
  await deliverToInbox(`Ana <ana@recusa-${run}.pt>`, `Re: Ideia ${run}`, 'Boa tarde,\r\n\r\nObrigada, mas não temos interesse de momento.\r\n\r\nEm 01/10/2026, Va escreveu:\r\n> Olá');
  await deliverToInbox(`Rui <geral@remove-${run}.pt>`, `Re: Ideia ${run}`, 'Por favor removam o meu email da vossa lista.');
  await deliverToInbox(
    `Rita <geral@ferias-${run}.pt>`,
    'Ausência: estou de férias',
    `Olá, estou fora do escritório até ${d}/${m}/${y}. Respondo quando regressar.`,
    'Auto-Submitted: auto-replied\r\n',
  );

  await page.goto('/definicoes/email');
  await page.getByRole('button', { name: 'Verificar agora' }).click();
  await expect(page.getByText(/devolvid/i).first()).toBeVisible();

  // Devolvido: data na ficha e próxima ação para hoje.
  const b = await getLead(page.request, bounced.id);
  expect(b.email_bounced_at).not.toBeNull();
  expect(b).toMatchObject({ next_action_on: today(), next_action_text: 'Email devolvido: procurar outro email ou contactar por telefone' });
  const activity = (await (await page.request.get(`/api/v1/leads/${bounced.id}/activities`)).json()).data as { type: string }[];
  expect(activity.some((a) => a.type === 'email_bounced')).toBe(true);

  // "Não temos interesse" (o texto citado não conta) e "removam-me".
  expect(await getLead(page.request, declined.id)).toMatchObject({ status: 'sem_interesse', lost_reason: 'respondeu_nao' });
  expect(await getLead(page.request, removed.id)).toMatchObject({ status: 'sem_interesse', lost_reason: 'respondeu_nao' });
  const dnc = (await (await page.request.get('/api/v1/do-not-contact')).json()).data as { email: string | null }[];
  expect(dnc.some((r) => r.email === `geral@remove-${run}.pt`)).toBe(true);

  // Ausência: o follow-up passa para o dia em que volta (dia útil).
  expect(await getLead(page.request, away.id)).toMatchObject({ status: 'contactado', next_action_on: workday(back) });

  // Na ficha: email riscado com o aviso; ao mudar o email, o aviso sai.
  await page.goto(`/leads/${bounced.id}`);
  await expect(page.getByText(/Email devolvido a \d{2}\/\d{2}\/\d{4}: procura outro email ou liga\./)).toBeVisible();
  const patch = await page.request.patch(`/api/v1/leads/${bounced.id}`, { data: { email: `geral@devolve-${run}.pt` } });
  expect(patch.status(), await patch.text()).toBe(200);
  expect((await getLead(page.request, bounced.id)).email_bounced_at).toBeNull();

  // Segunda leitura: nada de novo.
  const again = (await (await page.request.post('/api/v1/mail-account/check-replies')).json()).data;
  expect(again).toEqual({ checked: 0, replies: [], bounces: [], out_of_office: 0 });
});

test('verificar o email: endereço mal escrito, Gmail e domínio desconhecido', async ({ page }) => {
  const invalid = await page.request.get(`/api/v1/email-check?email=${encodeURIComponent('geral@empresa')}`);
  expect(invalid.status()).toBe(200);
  expect((await invalid.json()).data.status).toBe('invalid');
  // Gmail e afins não precisam de consulta; sem DNS (ex.: no teste), um domínio desconhecido fica "unknown".
  expect((await (await page.request.get('/api/v1/email-check?email=ana@gmail.com')).json()).data.status).toBe('ok');
  expect(['ok', 'unknown', 'no_domain']).toContain((await (await page.request.get(`/api/v1/email-check?email=a@nao-existe-${run}.pt`)).json()).data.status);
});

test('estatísticas: aberto, clicado e respondido por modelo', async ({ page }) => {
  await connectAccount(page);
  const to = `stats-${run}@estatistica.pt`;
  const lead = await createLead(page.request, { company_name: `Estatística ${run}`, email: to });
  const subject = `Ideia ${run}`;
  const template = `Modelo ${run}`;
  const sent = await page.request.post(`/api/v1/leads/${lead.id}/email`, {
    data: { to, subject, template, body: 'Olá,\n\nVeja: https://vndesign.pt/portefolio\n\nCumprimentos,' },
  });
  expect(sent.status(), await sent.text()).toBe(200);
  const html = await mailHtml(page.request, to, subject);
  const pixel = /<img src="([^"]+\/o\.gif)"/.exec(html)?.[1];
  const link = /href="([^"]+\/api\/v1\/public\/t\/[^"]+\/0)"/.exec(html)?.[1];
  // Abre o cliente (sem a sessão da plataforma: as aberturas de quem está ligado não contam).
  const client = await request.newContext({ storageState: { cookies: [], origins: [] } });
  await client.get(pixel!, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
  await client.get(link!, { maxRedirects: 0, headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
  await client.dispose();
  await deliverToInbox(`Cliente <${to}>`, `Re: ${subject}`, 'Olá! Podemos falar amanhã?');
  await page.request.post('/api/v1/mail-account/check-replies');

  const stats = (await (await page.request.get('/api/v1/stats/emails?days=30')).json()).data;
  expect(stats.templates.find((t: { template: string }) => t.template === template)).toMatchObject({ sent: 1, opened: 1, clicked: 1, replied: 1 });
  expect(stats.heatmap).toHaveLength(7);
  expect(stats.heatmap[0]).toHaveLength(24);

  await page.goto('/estatisticas');
  await expect(page.getByText('Emails: o que resulta')).toBeVisible();
  await expect(page.getByText(template)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quando abrem os teus emails' })).toBeVisible();
});

test('horário de silêncio: ligar, escolher as horas e o fim de semana', async ({ page }) => {
  await page.request.put('/api/v1/preferences/notifications.quiet', { data: { value: { enabled: false } } });
  await page.goto('/definicoes/conta');
  const box = page.getByTestId('quiet-hours');
  await expect(box.getByText('Horário de silêncio')).toBeVisible();
  await box.getByRole('switch', { name: 'Ligar o horário de silêncio' }).click();
  await box.getByLabel('Início do silêncio').selectOption('22:00', { force: true });
  await box.getByLabel('Fim do silêncio').selectOption('07:30', { force: true });
  await box.getByLabel('Fim de semana inteiro').check();
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/preferences/notifications.quiet')).json()).data.value)
    .toEqual({ enabled: true, from: '22:00', to: '07:30', weekends: true });

  await page.reload();
  await expect(page.getByTestId('quiet-hours').getByRole('switch', { name: 'Desligar o horário de silêncio' })).toBeVisible();
});

test('prospeção (email): quem abriu o email aparece em "Abriram o email", mesmo sem email válido na ficha', async ({ page }) => {
  await connectAccount(page);
  const to = `abriu-${run}@quintal.pt`;
  // O email foi enviado para um endereço escrito à mão; a ficha não tem email.
  const lead = await createLead(page.request, { company_name: `Quintal ${run}`, phone: '912345678', status: 'contactado' });
  const subject = `Sugestão ${run}`;
  const sent = await page.request.post(`/api/v1/leads/${lead.id}/email`, { data: { to, subject, body: 'Olá,\n\nVeja: https://vndesign.pt/portefolio' } });
  expect(sent.status(), await sent.text()).toBe(200);
  const html = await mailHtml(page.request, to, subject);
  const link = /href="([^"]+\/api\/v1\/public\/t\/[^"]+\/0)"/.exec(html)?.[1];
  const client = await request.newContext({ storageState: { cookies: [], origins: [] } });
  await client.get(link!, { maxRedirects: 0, headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
  await client.dispose();

  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'email' } });
  await page.goto('/prospecao');
  await page.getByRole('tab', { name: 'Abriram o email' }).click();
  const row = page.getByRole('list', { name: 'Leads para contactar' }).getByRole('listitem', { name: new RegExp(`Quintal ${run}`) });
  await expect(row.getByText(/Carregou num link do email/)).toBeVisible();
  await expect(row.getByRole('link', { name: 'Ligar' }).or(row.getByRole('button', { name: 'Ligar' })).first()).toBeVisible();
  // E não aparece em "Falta email".
  const missing = (await (await page.request.get('/api/v1/prospecting?filter=missing&mode=email')).json()).data.items as { lead: { id: string } }[];
  expect(missing.some((i) => i.lead.id === lead.id)).toBe(false);
});

test('prospeção (telefone): um email devolvido não conta como contacto e não há follow-up para ele', async ({ page }) => {
  await connectAccount(page);
  const email = `ninguem@so-email-${run}.pt`;
  const lead = await createLead(page.request, { company_name: `Só Email ${run}`, email, status: 'contactado' });
  await deliverToInbox(
    'Mail Delivery System <MAILER-DAEMON@mail.vndesign.pt>',
    'Undelivered Mail Returned to Sender',
    `This is the mail system.\r\n\r\nFinal-Recipient: rfc822; ${email}\r\nStatus: 5.1.1\r\n`,
  );
  await page.request.post('/api/v1/mail-account/check-replies');
  expect((await getLead(page.request, lead.id)).email_bounced_at).not.toBeNull();
  // O mais atrasado vem primeiro na fila (a base de teste tem muitos follow-ups).
  const patch = await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { next_action_on: '2020-01-02' } });
  expect(patch.status(), await patch.text()).toBe(200);

  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'phone' } });
  await page.goto('/prospecao');
  await page.getByRole('tab', { name: 'Follow-ups' }).click();
  const name = new RegExp(`Só Email ${run}`);
  await expect(page.getByRole('list', { name: 'Leads para contactar' }).getByRole('listitem', { name })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Falta contacto' }).click();
  const row = page.getByRole('listitem', { name });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Procurar contacto' })).toBeVisible();

  // Na ficha: sem botão "Enviar follow-up" para o endereço devolvido.
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByText(/Email devolvido a/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Enviar follow-up/ })).toHaveCount(0);
  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'email' } });
});

test('prospeção: separadores com contagens e "Falta email" calculado no servidor', async ({ page }) => {
  const past = '2020-01-03';
  const semEmail = await createLead(page.request, { company_name: `Sem Email FU ${run}`, phone: '912000111', status: 'contactado' });
  const comEmail = await createLead(page.request, { company_name: `Com Email FU ${run}`, email: `geral@fu-${run}.pt`, status: 'contactado' });
  for (const id of [semEmail.id, comEmail.id]) {
    const res = await page.request.patch(`/api/v1/leads/${id}`, { data: { next_action_on: past, next_action_text: 'Follow-up' } });
    expect(res.status(), await res.text()).toBe(200);
  }
  const queue = async (filter: string, mode: string) =>
    (await (await page.request.get(`/api/v1/prospecting?filter=${filter}&mode=${mode}`)).json()).data as {
      items: { lead: { id: string }; kind: string }[];
      counts: Record<string, number>;
    };
  const ids = (q: { items: { lead: { id: string } }[] }) => q.items.map((i) => i.lead.id);

  // Por email: o lead sem email está em "Falta email", não em "Follow-ups".
  const fu = await queue('follow_up', 'email');
  expect(ids(fu)).toContain(comEmail.id);
  expect(ids(fu)).not.toContain(semEmail.id);
  const miss = await queue('missing', 'email');
  expect(ids(miss)).toContain(semEmail.id);
  expect(ids(miss)).not.toContain(comEmail.id);
  expect(miss.counts.missing).toBeGreaterThanOrEqual(1);
  expect(fu.counts.all).toBe(fu.counts.opened + fu.counts.follow_up + fu.counts.new);
  // Por telefone: o mesmo lead (tem telefone) já está nos "Follow-ups".
  expect(ids(await queue('follow_up', 'phone'))).toContain(semEmail.id);
  expect(ids(await queue('missing', 'phone'))).not.toContain(semEmail.id);

  // No ecrã: contagem em cada separador e a lista "Falta email" vem do servidor.
  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'email' } });
  await page.goto('/prospecao');
  await expect(page.getByRole('tab', { name: /^Follow-ups \d+$/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Falta email \d+$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /com follow-up ou por contactar sem email → Falta email/ })).toBeVisible();
  await page.getByRole('tab', { name: /^Falta email/ }).click();
  await expect(page.getByRole('list', { name: 'Leads sem contacto' }).getByRole('listitem', { name: new RegExp(`Sem Email FU ${run}`) })).toBeVisible();
  await page.getByRole('tab', { name: /^Follow-ups/ }).click();
  await expect(page.getByRole('list', { name: 'Leads para contactar' }).getByRole('listitem', { name: new RegExp(`Com Email FU ${run}`) })).toBeVisible();
});

test('lista Respostas no Dashboard: por responder, Responder na conversa, Já tratei e ausências', async ({ page }) => {
  await connectAccount(page);
  const a = await createLead(page.request, { company_name: `Resposta A ${run}`, email: `geral@resp-a-${run}.pt`, status: 'contactado' });
  const b = await createLead(page.request, { company_name: `Resposta B ${run}`, email: `geral@resp-b-${run}.pt`, status: 'contactado' });
  const c = await createLead(page.request, { company_name: `Resposta C ${run}`, email: `geral@resp-c-${run}.pt`, status: 'contactado' });
  await deliverToInbox(`Ana <geral@resp-a-${run}.pt>`, `Re: Proposta ${run}`, 'Olá! Pode enviar mais detalhes sobre o preço?');
  await deliverToInbox(`Bruno <geral@resp-b-${run}.pt>`, `Re: Ideia ${run}`, 'Boa tarde, ligo-lhe amanhã.');
  await deliverToInbox(`Carla <geral@resp-c-${run}.pt>`, 'Ausência', `Estou de férias até ${(() => { const d = new Date(Date.now() + 10 * 86_400_000); return `${d.getDate()}/${d.getMonth() + 1}`; })()}.`, 'Auto-Submitted: auto-replied\r\n');
  await page.request.post('/api/v1/mail-account/check-replies');

  const replies = (await (await page.request.get('/api/v1/replies')).json()).data as {
    pending: number;
    items: { lead: { id: string }; kind: string; handled: boolean; message_id: string | null }[];
  };
  const of = (id: string) => replies.items.find((i) => i.lead.id === id)!;
  expect(of(a.id)).toMatchObject({ kind: 'reply', handled: false });
  expect(of(b.id)).toMatchObject({ kind: 'reply', handled: false });
  expect(of(c.id)).toMatchObject({ kind: 'auto' });

  await page.goto('/dashboard');
  const card = page.getByRole('list', { name: 'Respostas por responder' });
  const rowA = card.getByRole('listitem', { name: new RegExp(`Resposta A ${run}`) });
  await expect(rowA).toBeVisible();
  await expect(card.getByRole('listitem', { name: new RegExp(`Resposta C ${run}`) })).toHaveCount(0);

  // Uma resposta acabada de chegar: "Verificar agora" lê a caixa sem esperar pelos 10 minutos.
  await expect(page.getByText(/Caixa de entrada lida .+ · lê-se sozinha de 10 em 10 minutos/)).toBeVisible();
  const d = await createLead(page.request, { company_name: `Resposta D ${run}`, email: `geral@resp-d-${run}.pt`, status: 'contactado' });
  await deliverToInbox(`Diana <geral@resp-d-${run}.pt>`, `Re: Orçamento ${run}`, 'Sim, tenho interesse.');
  await page.getByRole('button', { name: 'Verificar agora' }).click();
  await expect(page.getByText(new RegExp(`1 resposta nova: Resposta D ${run}`))).toBeVisible();
  await expect(card.getByRole('listitem', { name: new RegExp(`Resposta D ${run}`) })).toBeVisible();
  expect(d.id).toBeTruthy();

  // Responder na mesma conversa (Re: e In-Reply-To): deixa de estar por responder.
  await rowA.getByRole('button', { name: 'Responder' }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`Responder a Resposta A ${run}`) });
  await expect(dialog.getByLabel('Assunto')).toHaveValue(`Re: Proposta ${run}`);
  await dialog.getByLabel('Mensagem').fill('Olá Ana,\n\nSegue em anexo o preço.\n\nCumprimentos');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(rowA).toHaveCount(0);

  // "Já tratei" (respondeu pelo Gmail).
  const rowB = card.getByRole('listitem', { name: new RegExp(`Resposta B ${run}`) });
  await rowB.getByRole('button', { name: 'Já tratei' }).click();
  await expect(rowB).toHaveCount(0);
  const after = (await (await page.request.get('/api/v1/replies')).json()).data as { items: { lead: { id: string }; handled: boolean }[] };
  expect(after.items.find((i) => i.lead.id === b.id)?.handled).toBe(true);

  // "Todas": a ausência com a data de regresso.
  await page.getByRole('tab', { name: /^Todas/ }).click();
  const all = page.getByRole('list', { name: 'Todas as respostas' });
  await expect(all.getByRole('listitem', { name: new RegExp(`Resposta C ${run}`) }).getByText(/Ausente até \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(all.getByRole('listitem', { name: new RegExp(`Resposta A ${run}`) }).getByText('Respondida')).toBeVisible();

  // Recolher o cartão: fica só o resumo (e lembra-se ao voltar).
  await page.getByRole('button', { name: 'Recolher: Respostas' }).click();
  await expect(page.getByRole('list', { name: 'Todas as respostas' })).toHaveCount(0);
  await expect(page.getByText(/(\d+ por responder|Nenhuma por responder) · \d+ nos últimos 14 dias/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir: Respostas' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir: Respostas' }).click();

  // Outro serviço de email: o endereço do webmail escolhido em Definições → Email.
  await page.goto('/definicoes/email');
  const webmail = page.getByLabel('Endereço do webmail (opcional)');
  await webmail.fill('outlook');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Escreve o endereço completo (ex.: https://outlook.live.com/mail/).')).toBeVisible();
  await webmail.fill('https://webmail.empresa-teste.pt/');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/Conta de email guardada/)).toBeVisible();
  await page.goto('/dashboard');
  await page.getByRole('tab', { name: /^Todas/ }).click();
  const link = page.getByRole('list', { name: 'Todas as respostas' }).getByRole('listitem', { name: new RegExp(`Resposta C ${run}`) }).getByRole('link', { name: 'Abrir em webmail.empresa-teste.pt' });
  await expect(link).toHaveAttribute('href', 'https://webmail.empresa-teste.pt/');
  await page.request.put('/api/v1/preferences/mail.webmail', { data: { value: '' } });
});
