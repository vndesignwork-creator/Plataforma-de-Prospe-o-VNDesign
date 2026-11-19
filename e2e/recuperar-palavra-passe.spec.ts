import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Recuperar a palavra-passe: o email sai da própria plataforma, em português,
 * e o link abre a página "Nova palavra-passe". Sem sessão de recuperação, a
 * página diz que o link expirou.
 */
const MAILPIT = 'http://127.0.0.1:54324/api/v1';
const EMAIL = 'e2e@vndesign.pt';

type MailpitMessage = { ID: string; Subject: string; To: { Address: string }[] };

/** Lê uma variável do .env.local (chave de administrador do Supabase local). */
function localEnv(name: string): string {
  const line = readFileSync('apps/web/.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

async function mailTo(request: APIRequestContext, address: string, subject: string): Promise<MailpitMessage> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        const list = ((await res.json()).messages ?? []) as MailpitMessage[];
        found = list.find((m) => m.Subject === subject);
        return !!found;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}

test.describe.configure({ mode: 'serial' });

test('esqueci-me da palavra-passe: email em português da própria plataforma', async ({ browser, request }) => {
  test.setTimeout(120_000);
  // Sem sessão: é assim que se chega ao ecrã de entrada.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByRole('button', { name: 'Esqueci-me da palavra-passe' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Se existir uma conta com esse email' })).toBeVisible();
  } finally {
    await context.close();
  }

  // O email é o nosso (assunto em português) e leva um link para a página.
  const message = await mailTo(request, EMAIL, 'Nova palavra-passe · VNDesign Leads');
  const body = await (await request.get(`${MAILPIT}/message/${message.ID}`)).json();
  expect(body.Text).toContain('Pediste uma nova palavra-passe');
  expect(body.Text).toContain('O link serve durante 1 hora');
  expect(body.Text).toMatch(/https?:\/\/[^\s]+/);
});

test('email sem conta: a resposta é igual (ninguém descobre quem tem conta)', async ({ page }) => {
  const res = await page.request.post('/api/v1/public/password-reset', { data: { email: `nao-existe-${Date.now().toString(36)}@vndesign.pt` } });
  expect(res.status()).toBe(200);
  expect((await res.json()).data.message).toContain('Se existir uma conta');
  // Email inválido não passa.
  expect((await page.request.post('/api/v1/public/password-reset', { data: { email: 'xpto' } })).status()).toBe(422);
});

test('página da nova palavra-passe sem link válido: diz que expirou', async ({ browser }) => {
  // Sem sessão (nada de storageState): é o que acontece com um link gasto.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto('/nova-palavra-passe');
    await expect(page.getByText('O link expirou ou já foi usado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pedir um link novo' })).toHaveAttribute('href', '/login');
  } finally {
    await context.close();
  }
});

test('com sessão: as duas têm de ser iguais e guarda a nova', async ({ browser, request }) => {
  test.setTimeout(150_000);
  // Utilizador só para este teste (não mexe na palavra-passe do utilizador dos testes).
  const key = localEnv('SUPABASE_SECRET_KEY');
  const url = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const email = `reset-${Date.now().toString(36)}@vndesign.pt`;
  const admin = await request.fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: { email, password: 'password-antiga-123', email_confirm: true },
  });
  expect(admin.status(), await admin.text()).toBe(200);
  const userId = (await admin.json()).id as string;

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Palavra-passe').fill('password-antiga-123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Espera a sessão (sai do ecrã de entrada) antes de abrir a página.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
    await page.goto('/nova-palavra-passe');
    await expect(page.getByRole('heading', { name: 'Nova palavra-passe' })).toBeVisible();

    // Não bastam os dois campos: têm de ser iguais.
    await page.getByRole('textbox', { name: 'Nova palavra-passe' }).fill('palavra-nova-123');
    await page.getByRole('textbox', { name: 'Repetir a palavra-passe' }).fill('outra-coisa-123');
    await page.getByRole('button', { name: 'Guardar e entrar' }).click();
    await expect(page.getByText('As palavras-passe não são iguais.')).toBeVisible();

    // Iguais: guarda e entra.
    await page.getByRole('textbox', { name: 'Repetir a palavra-passe' }).fill('palavra-nova-123');
    await page.getByRole('button', { name: 'Guardar e entrar' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Palavra-passe alterada' })).toBeVisible();
    await expect(page).not.toHaveURL(/nova-palavra-passe/);
  } finally {
    await context.close();
    await request.fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  }
});
