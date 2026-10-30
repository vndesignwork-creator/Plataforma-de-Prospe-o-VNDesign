import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Imagens do site, aberturas dos emails, sessão de prospeção, partilhar para a
 * app, checklist de lançamento, verificação em dois passos e colaboradores.
 * PageSpeed falso em e2e/stubs.ts (PAGESPEED_ENDPOINT); emails no Mailpit.
 */
const run = Date.now().toString(36);
const FROM = `va+v5${run}@vndesign.pt`;
const MAILPIT = 'http://127.0.0.1:54324/api/v1';
// Dias de calendário em Lisboa (somar 24 h falha na mudança de hora).
// Os follow-ups automáticos não caem ao fim de semana: sábado e domingo passam para segunda.
const workday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const shift = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 1 : 0;
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
};
const lisbonDay = (days: number) => {
  const d = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let stop: () => void;
test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop?.());

function localEnv(name: string): string | undefined {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string; number: number; company_name: string };
}

async function connectAccount(page: Page) {
  const res = await page.request.put('/api/v1/mail-account', {
    data: { provider: 'custom', from_name: 'Va Teste', from_email: FROM, smtp_host: '127.0.0.1', smtp_port: 54325, smtp_secure: false, reply_detection: false },
  });
  expect(res.status(), await res.text()).toBe(200);
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

async function anonymous(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

/** Código TOTP (RFC 6238) a partir da chave em base32. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Ficha do cliente: as partes do projeto estão em separadores (Trabalho e entregas | Tempo e dinheiro | Cliente e equipa). */
async function projectTab(page: import('@playwright/test').Page, name: string) {
  await page.locator('#projeto').getByRole('tablist', { name: 'Partes do projeto' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

test('imagens do site: tirar no telemóvel e no computador, no relatório e no email', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Imagens ${run}`, website: 'http://localhost:3000/offline', services: ['site_institucional'] });
  const audit = await page.request.post(`/api/v1/leads/${lead.id}/audits`, { data: {} });
  expect(audit.status(), await audit.text()).toBe(201);

  await page.goto(`/leads/${lead.id}`);
  const shots = page.getByRole('region', { name: 'Imagens do site' });
  await shots.getByRole('button', { name: 'Tirar imagens' }).click();
  await expect(page.getByText('Imagens do site guardadas.')).toBeVisible({ timeout: 60_000 });
  await expect(shots.getByRole('img', { name: 'O site no computador' })).toBeVisible();
  await expect(shots.getByRole('img', { name: 'O site no telemóvel' })).toBeVisible();
  // A imagem abre (redireciona para um link temporário do Storage).
  const src = await shots.getByRole('img', { name: 'O site no telemóvel' }).getAttribute('src');
  const img = await page.request.get(src!);
  expect(img.headers()['content-type']).toContain('image/jpeg');

  const pdf = await page.request.get(`/api/v1/leads/${lead.id}/diagnosis-pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).length).toBeGreaterThan(5_000);

  await connectAccount(page);
  const to = `imagens-${run}@cliente.pt`;
  const sent = await page.request.post(`/api/v1/leads/${lead.id}/email`, {
    data: { to, subject: `Imagens ${run}`, body: 'Olá,\n\nVeja como o site aparece.', attach_screenshots: true },
  });
  expect(sent.status(), await sent.text()).toBe(200);
  const res = await page.request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  expect(((await res.json()).messages as { Attachments: number }[])[0]?.Attachments).toBe(2);
});

test('aberturas do email: imagem de 1×1, clique no link, linha do tempo, Hoje e sessão de prospeção', async ({ page }) => {
  await connectAccount(page);
  const to = `abre-${run}@cliente.pt`;
  const lead = await createLead(page.request, { company_name: `Abre Email ${run}`, email: to, phone: '912345678' });
  const subject = `Ideia para o site ${run}`;
  const sent = await page.request.post(`/api/v1/leads/${lead.id}/email`, {
    data: { to, subject, body: 'Olá,\n\nVeja este exemplo: https://vndesign.pt/portefolio\n\nCumprimentos,' },
  });
  expect(sent.status(), await sent.text()).toBe(200);

  const html = await mailHtml(page.request, to, subject);
  const pixel = /<img src="([^"]+\/o\.gif)"/.exec(html)?.[1];
  const link = /href="([^"]+\/api\/v1\/public\/t\/[^"]+\/0)"/.exec(html)?.[1];
  expect(pixel).toBeTruthy();
  expect(link).toBeTruthy();
  expect(html).not.toContain('href="https://vndesign.pt/portefolio"');

  // Quem é da equipa (com sessão iniciada, ex.: o email nos "Enviados") não conta.
  await page.request.get(pixel!, { headers: { 'user-agent': 'Mozilla/5.0 (Windows)' } });
  const own = await page.request.get(link!, { maxRedirects: 0, headers: { 'user-agent': 'Mozilla/5.0 (Windows)' } });
  expect(own.headers().location).toBe('https://vndesign.pt/portefolio');
  expect((await (await page.request.get(`/api/v1/leads/${lead.id}/email-tracking`)).json()).data[0]).toMatchObject({ opens: 0, clicks: 0 });

  // O lead (sem sessão na plataforma).
  const outsider = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } });
  const gif = await outsider.get(pixel!, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
  expect(gif.headers()['content-type']).toBe('image/gif');
  const click = await outsider.get(link!, { maxRedirects: 0, headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
  expect(click.status()).toBe(302);
  expect(click.headers().location).toBe('https://vndesign.pt/portefolio');
  await outsider.dispose();

  const tracking = (await (await page.request.get(`/api/v1/leads/${lead.id}/email-tracking`)).json()).data;
  expect(tracking[0]).toMatchObject({ subject, opens: 1, clicks: 1 });

  await page.goto(`/leads/${lead.id}`);
  const timeline = page.getByLabel('Atividade do lead');
  await expect(timeline.getByText('O lead abriu o email')).toBeVisible();
  await expect(timeline.getByText('O lead carregou num link')).toBeVisible();
  await expect(timeline.getByText(/Aberto 1× · última vez a/)).toBeVisible();

  await page.goto('/dashboard');
  const opened = page.getByRole('region', { name: 'Abriram o teu email' });
  await expect(opened.getByText(`Abre Email ${run}`)).toBeVisible();

  // Sessão de prospeção (a trabalhar por email): quem abriu o email aparece primeiro.
  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'email' } });
  await page.goto('/prospecao');
  await expect(page.getByRole('radio', { name: 'Email' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('tab', { name: 'Abriram o email' }).click();
  const name = new RegExp(`Abre Email ${run}`);
  const row = page.getByRole('list', { name: 'Leads para contactar' }).getByRole('listitem', { name });
  await expect(row.getByText(/Carregou num link do email/)).toBeVisible();
  // O follow-up seguinte já escrito: rever e enviar. O lead fica em "Feito nesta sessão", sem registar nada.
  await row.getByRole('button', { name: 'Enviar follow-up' }).click();
  const dialog = page.getByRole('dialog', { name: /Enviar follow-up/ });
  await expect(dialog.getByLabel('Assunto')).toHaveValue(/^Re: /);
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  const done = page.getByRole('list', { name: 'Leads tratados nesta sessão' }).getByRole('listitem', { name });
  await expect(done).toContainText('Email enviado');
  await expect(page.getByText(/Hoje: \d+ emails? enviados?/)).toBeVisible();
  // Depois ligou: Nota + Registar → Interessado.
  await done.getByRole('button', { name: 'Nota' }).click();
  await done.getByLabel('Nota (opcional)').fill('Pediu para ligar às 15h');
  await done.getByRole('button', { name: 'Registar' }).click();
  await page.getByRole('menuitem', { name: 'Interessado' }).click();
  await expect(page.getByText(new RegExp(`#${lead.number} Abre Email ${run}: registado`))).toBeVisible();
  const after = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data;
  expect(after.status).toBe('respondeu');
  const activities = (await (await page.request.get(`/api/v1/leads/${lead.id}/activities`)).json()).data as { body: string | null }[];
  expect(activities.some((a) => a.body === 'Interessado: Pediu para ligar às 15h')).toBe(true);
});

test('email devolvido: as aberturas desse email não contam (o email não chegou ao lead)', async ({ page }) => {
  await connectAccount(page);
  const to = `devolvido-${run}@cliente.pt`;
  const lead = await createLead(page.request, { company_name: `Devolvido ${run}`, email: to });
  const subject = `Proposta devolvida ${run}`;
  const sent = await page.request.post(`/api/v1/leads/${lead.id}/email`, { data: { to, subject, body: 'Olá,\n\nVeja: https://vndesign.pt/portefolio' } });
  expect(sent.status(), await sent.text()).toBe(200);
  const html = await mailHtml(page.request, to, subject);
  const pixel = /<img src="([^"]+\/o\.gif)"/.exec(html)?.[1];
  // O endereço devolveu o email (como faz a verificação das respostas).
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL')!;
  const key = localEnv('SUPABASE_SECRET_KEY')!;
  const patched = await page.request.patch(`${url}/rest/v1/leads?id=eq.${lead.id}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
    data: { email_bounced_at: new Date().toISOString() },
  });
  expect(patched.status(), await patched.text()).toBe(204);
  const outsider = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } });
  await outsider.get(pixel!, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) GoogleImageProxy' } });
  await outsider.dispose();
  expect((await (await page.request.get(`/api/v1/leads/${lead.id}/email-tracking`)).json()).data[0]).toMatchObject({ subject, opens: 0 });
});

test('sessão de prospeção pela API: não atendeu, contactado e mais tarde', async ({ request }) => {
  const lead = await createLead(request, { company_name: `Sessão ${run}`, phone: '912000111' });
  const tomorrow = workday(lisbonDay(1));
  let res = await request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'no_answer' } });
  expect(res.status(), await res.text()).toBe(200);
  // Ainda não houve contacto: a próxima ação é o primeiro contacto, não um follow-up.
  expect((await res.json()).data.lead).toMatchObject({ status: 'identificado', next_action_on: tomorrow, next_action_text: 'Primeiro contacto' });
  res = await request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'contacted' } });
  const body = (await res.json()).data;
  expect(body.lead.status).toBe('contactado');
  expect(body.lead.next_action_text).not.toBe('Primeiro contacto');
  expect(body.done_today).toBeGreaterThanOrEqual(2);
  res = await request.post(`/api/v1/leads/${lead.id}/prospecting`, { data: { outcome: 'later', days: 7 } });
  expect((await res.json()).data.lead.next_action_on).toBe(workday(lisbonDay(7)));
  const queue = (await (await request.get('/api/v1/prospecting?filter=new')).json()).data;
  expect(queue.items.some((i: { lead: { id: string } }) => i.lead.id === lead.id)).toBe(false);
});

test('lead ainda não contactado: adiar fica "Primeiro contacto"; "Feito" passa a Contactado', async ({ request }) => {
  const lead = await createLead(request, { company_name: `Primeiro ${run}`, phone: '912000222' });
  let res = await request.post(`/api/v1/leads/${lead.id}/follow-up`, { data: { action: 'snooze', days: 2 } });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).data).toMatchObject({ status: 'identificado', next_action_text: 'Primeiro contacto' });
  res = await request.post(`/api/v1/leads/${lead.id}/follow-up`, { data: { action: 'done', days: 3 } });
  expect(res.status(), await res.text()).toBe(200);
  const done = (await res.json()).data;
  expect(done).toMatchObject({ status: 'contactado', next_action_text: 'Enviar follow-up', first_contact_on: lisbonDay(0) });
  expect(done.next_action_on).toBe(workday(lisbonDay(3)));
});

test('partilhar para a app: o Instagram preenche o lead novo', async ({ page }) => {
  const text = `Veja o perfil de Padaria Partilha ${run} (@padaria.partilha) no Instagram\nRua do Teste 1, 1000-001 Lisboa`;
  await page.goto(`/partilhar?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://www.instagram.com/padaria.partilha?igsh=abc')}`);
  await expect(page.getByText(/Encontrado: Instagram/)).toBeVisible();
  await expect(page.getByLabel('Empresa')).toHaveValue(`Padaria Partilha ${run}`);
  await expect(page.getByLabel('Cidade')).toHaveValue('Lisboa');
  await page.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page).toHaveURL(/\/leads\/\d+-padaria-partilha/);

  // Colar um link à mão (iPhone / computador).
  await page.goto('/partilhar');
  await page.getByLabel('Link ou texto partilhado').fill('https://maps.google.com/maps/place/Oficina+Partilha/@38.71,-9.14,17z');
  await page.getByRole('button', { name: 'Ler o link' }).click();
  await expect(page.getByLabel('Empresa')).toHaveValue('Oficina Partilha');
});

test('checklist de lançamento: verificar o site e marcar à mão', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Lançamento ${run}`, status: 'cliente', services: ['site_institucional'], website: 'http://localhost:3000/login' });
  await page.goto(`/leads/${lead.id}`);
  const section = page.getByRole('region', { name: 'Checklist de lançamento' });
  await section.getByRole('button', { name: 'Ver lista' }).click();
  await expect(section.getByLabel('Endereço do site novo')).toHaveValue('http://localhost:3000/login');
  await section.getByRole('button', { name: 'Verificar o site' }).click();
  await expect(page.getByText(/Site verificado: \d+ de 19 pontos feitos\./)).toBeVisible({ timeout: 30_000 });
  await expect(section.getByText('O site abre sem HTTPS.')).toBeVisible();
  await expect(section.getByLabel('Adaptado ao telemóvel')).toBeChecked();
  const before = (await (await page.request.get(`/api/v1/leads/${lead.id}/launch`)).json()).data.done as number;
  await section.getByLabel('Formulário de contacto testado (o email chega)').click();
  await expect(section.getByLabel('Formulário de contacto testado (o email chega)')).toBeChecked();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/leads/${lead.id}/launch`)).json()).data.done).toBe(before + 1);
});

test('verificação em dois passos: ligar, entrar com o código e sessões abertas', async ({ browser }) => {
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL')!;
  const key = localEnv('SUPABASE_SECRET_KEY')!;
  const email = `mfa-${run}@vndesign.pt`;
  const password = `Teste-${run}-2fa`;
  const { context, page } = await anonymous(browser);
  const created = await page.request.post(`${url}/auth/v1/admin/users`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    data: { email, password, email_confirm: true },
  });
  expect(created.status(), await created.text()).toBe(200);
  const userId = (await created.json()).id as string;
  try {
    const login = async () => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Palavra-passe').fill(password);
      await page.getByRole('button', { name: 'Entrar' }).click();
    };
    await login();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/definicoes/conta');
    const card = page.locator('#dois-passos');
    await card.getByRole('button', { name: 'Ligar a verificação' }).click();
    const secret = (await card.locator('code').innerText()).trim();
    await card.getByLabel('Código da app').fill(totp(secret));
    await card.getByRole('button', { name: 'Confirmar e ligar' }).click();
    await expect(page.getByText(/Verificação em dois passos ligada/)).toBeVisible();
    await expect(page.locator('#sessoes').getByText('Este aparelho')).toBeVisible();

    // Nova entrada: depois da palavra-passe, pede o código.
    await page.locator('form[action="/auth/signout"] button').first().click();
    await login();
    await expect(page).toHaveURL(/\/verificar/);
    // Sem o código, a API recusa.
    const blocked = await page.request.get('/api/v1/leads');
    expect(blocked.status()).toBe(401);
    expect((await blocked.json()).code).toBe('mfa_required');
    await page.getByLabel('Código').fill('000000');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/Código errado ou expirado/)).toBeVisible();
    await page.getByLabel('Código').fill(totp(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect((await page.request.get('/api/v1/leads')).status()).toBe(200);
    const sessions = (await (await page.request.get('/api/v1/me/sessions')).json()).data as { current: boolean; verified: boolean }[];
    expect(sessions.find((s) => s.current)?.verified).toBe(true);
  } finally {
    await context.close();
    const admin = await playwrightRequest.newContext();
    await admin.delete(`${url}/auth/v1/admin/users/${userId}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    await admin.dispose();
  }
});

test('colaboradores: convidar, aceitar, portal só do projeto e remover', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const lead = await createLead(page.request, { company_name: `Colabora ${run}`, status: 'cliente', estimated_value: 4321, email: `cliente-colabora-${run}@exemplo.pt` });
  await page.request.post(`/api/v1/leads/${lead.id}/tasks`, { data: { title: 'Montar a página inicial' } });
  const email = `colab-${run}@exemplo.pt`;

  await page.goto(`/leads/${lead.id}`);
  await projectTab(page, 'Cliente e equipa');
  const section = page.getByRole('region', { name: 'Colaboradores' });
  await section.getByRole('button', { name: 'Convidar' }).click();
  await section.getByLabel('Nome').fill('Rui Programador');
  await section.getByLabel('Email do colaborador').fill(email);
  await section.getByLabel('Enviar o convite por email').uncheck();
  await section.getByRole('button', { name: 'Convidar' }).click();
  await expect(page.getByText(/Convite criado/)).toBeVisible();
  await expect(section.getByText('Convite por aceitar')).toBeVisible();
  const [invite] = (await (await page.request.get(`/api/v1/leads/${lead.id}/collaborators`)).json()).data as { id: string; token: string }[];

  const collab = await anonymous(browser);
  try {
    await collab.page.goto(`/convite/${invite!.token}`);
    await expect(collab.page.getByRole('heading', { name: `Projeto Colabora ${run}` })).toBeVisible();
    await collab.page.getByLabel('O teu nome').fill('Rui Programador');
    await collab.page.getByLabel('Escolhe uma palavra-passe').fill(`Colab-${run}-pw`);
    await collab.page.getByRole('button', { name: 'Criar conta e aceitar' }).click();
    await expect(collab.page).toHaveURL(/\/colaborador$/);
    await collab.page.getByRole('link', { name: new RegExp(`Colabora ${run}`) }).click();
    await expect(collab.page.getByRole('heading', { name: `Colabora ${run}` })).toBeVisible();
    // Nunca vê valores nem contactos do cliente.
    await expect(collab.page.getByText(/4321|4\s?321/)).toHaveCount(0);
    await expect(collab.page.getByText(`cliente-colabora-${run}@exemplo.pt`)).toHaveCount(0);

    await collab.page.getByRole('checkbox', { name: 'Montar a página inicial' }).click();
    await expect(collab.page.getByRole('checkbox', { name: 'Montar a página inicial' })).toBeChecked();
    await collab.page.getByLabel('Título').fill('Maquete v1');
    await collab.page.getByLabel('Link').fill('https://figma.com/file/abc');
    await collab.page.getByRole('button', { name: 'Juntar' }).last().click();
    await expect(collab.page.getByText('Entrega junta. Quem te convidou é avisado.')).toBeVisible();
    await collab.page.getByLabel('Minutos').fill('90');
    await collab.page.getByRole('button', { name: 'À mão' }).click();
    await expect(collab.page.getByText('Horas registadas.')).toBeVisible();

    // A conta do colaborador não entra na plataforma nem na API dos leads.
    await collab.page.goto('/dashboard');
    await expect(collab.page).toHaveURL(/\/colaborador$/);
    expect((await collab.page.request.get('/api/v1/leads')).status()).toBe(403);

    // O dono vê o que o colaborador fez.
    const tasks = (await (await page.request.get(`/api/v1/leads/${lead.id}/tasks`)).json()).data as { title: string; done_at: string | null }[];
    expect(tasks.find((t) => t.title === 'Montar a página inicial')?.done_at).toBeTruthy();
    const deliverables = (await (await page.request.get(`/api/v1/leads/${lead.id}/deliverables`)).json()).data as { title: string; status: string }[];
    expect(deliverables).toContainEqual(expect.objectContaining({ title: 'Maquete v1', status: 'rascunho' }));
    await page.reload();
    // (As horas do colaborador também têm o nome, no separador "Tempo e dinheiro": procura-se na secção Colaboradores.)
    await expect(section.getByText('Rui Programador').first()).toBeVisible({ timeout: 20_000 });

    // Remover: perde logo o acesso.
    await section.getByRole('button', { name: `Remover ${email}` }).click();
    await section.getByRole('button', { name: 'Sim' }).click();
    await expect(page.getByText('Colaborador removido: já não tem acesso ao projeto.')).toBeVisible();
    expect((await collab.page.request.get(`/api/v1/collab/projects/${lead.id}`)).status()).toBe(404);
  } finally {
    await collab.context.close();
  }
});
