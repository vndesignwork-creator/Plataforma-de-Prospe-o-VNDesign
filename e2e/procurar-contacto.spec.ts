import { expect, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Procurar contacto (leads sem telefone ou email): atalhos de pesquisa, leitura
 * automática do site e da página de contactos (site falso em e2e/stubs.ts) e
 * guardar sem sair da página — na ficha e na sessão de prospeção.
 */
const run = Date.now().toString(36);
const SITE = 'http://127.0.0.1:4623/';

let stop: () => void;
test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop?.());

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data as { id: string };
}

test('ficha: procurar automaticamente no site, escolher e guardar', async ({ page }) => {
  const lead = await createLead(page.request, { company_name: `Tasca Exemplo ${run}`, city: 'Amadora', website: SITE });
  await page.goto(`/leads/${lead.id}`);
  const finder = page.getByRole('region', { name: 'Procurar contacto' });
  await expect(finder).toContainText('Sem telefone nem email');
  await expect(finder.getByRole('link', { name: /Google Maps/ })).toHaveAttribute('href', /google\.com\/maps\/search\/Tasca%20Exemplo/);

  await finder.getByRole('button', { name: 'Procurar automaticamente' }).click();
  const found = finder.getByRole('list', { name: 'Contactos encontrados' });
  await expect(found).toContainText('+351 213 456 789');
  await expect(found).toContainText('+351 912 345 678');
  await expect(found).toContainText('reservas@tasca-exemplo.pt');
  await expect(found).not.toContainText('212 345 678'); // o NIF não é telefone
  await expect(finder.getByLabel('Telefone')).toHaveValue('+351 213 456 789');
  await expect(finder.getByLabel('Email')).toHaveValue('reservas@tasca-exemplo.pt');

  await found.getByRole('button', { name: '+351 912 345 678' }).click();
  await expect(finder.getByLabel('Telefone')).toHaveValue('+351 912 345 678');
  await finder.getByRole('button', { name: 'Guardar contactos' }).click();
  await expect(page.getByText('Contactos guardados.')).toBeVisible();
  await expect(finder).toBeHidden();
  const saved = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data as { phone: string; email: string };
  expect(saved.phone.replace(/\D/g, '')).toContain('912345678');
  expect(saved.email).toBe('reservas@tasca-exemplo.pt');
});

test('sessão de prospeção: lead sem contactos, colar o telefone e aparece Ligar', async ({ page }) => {
  // Os de corridas anteriores saem da fila (para este ficar em primeiro).
  const old = (await (await page.request.get('/api/v1/leads?q=Sem%20Contactos&per_page=100')).json()).data as { id: string; status: string }[];
  for (const l of old.filter((l) => l.status === 'contactado')) await page.request.patch(`/api/v1/leads/${l.id}`, { data: { status: 'sem_interesse' } });
  const lead = await createLead(page.request, { company_name: `Sem Contactos ${run}`, status: 'contactado', website: 'https://www.facebook.com/semcontactos' });
  // Follow-up muito atrasado: fica em primeiro na fila.
  expect((await page.request.patch(`/api/v1/leads/${lead.id}`, { data: { next_action_on: '2000-01-01' } })).status()).toBe(200);
  await page.request.put('/api/v1/preferences/prospecting.mode', { data: { value: 'phone' } });
  await page.goto('/prospecao');
  // Sem telefone nem email: fica no separador "Falta contacto".
  await page.getByRole('tab', { name: 'Falta contacto' }).click();
  const row = page.getByRole('list', { name: 'Leads sem contacto' }).getByRole('listitem', { name: new RegExp(`Sem Contactos ${run}`) });
  await row.getByRole('button', { name: 'Procurar contacto' }).click();
  const finder = row.getByRole('region', { name: 'Procurar contacto' });
  // Facebook não se lê automaticamente: ficam os atalhos.
  await finder.getByRole('button', { name: 'Procurar automaticamente' }).click();
  await expect(page.getByText(/Sem site para ler|Não encontrei contactos novos/)).toBeVisible();
  await finder.getByLabel('Telefone').fill('912 000 111');
  await finder.getByRole('button', { name: 'Guardar contactos' }).click();
  await expect(page.getByText('Contactos guardados.')).toBeVisible();
  await expect(row.getByRole('group', { name: 'Contactar' }).getByRole('link', { name: 'Ligar' })).toBeVisible();
  // Ainda sem email: o "Procurar contacto" continua (só para o email).
  await expect(finder).toContainText('Sem email');
});
