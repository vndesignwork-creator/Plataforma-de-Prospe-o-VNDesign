import { expect, test, type Page } from '@playwright/test';

/*
 * Mensagens prontas no WhatsApp: o botão da ficha abre um menu com os modelos
 * do tipo WhatsApp (primeiro contacto, follow-up, lembrete de reunião) e abre
 * o wa.me com o texto já escrito. Desliga-se em Definições → Funcionalidades.
 */
const run = Date.now().toString(36);

/** Abre a mensagem escolhida e devolve o texto que foi para o WhatsApp. */
async function openMessage(page: Page, name: RegExp): Promise<string> {
  const popup = page.waitForEvent('popup');
  await page.getByRole('menuitem', { name }).click();
  const tab = await popup;
  const url = new URL(tab.url());
  await tab.close();
  expect(url.origin).toBe('https://wa.me');
  expect(url.pathname).toBe('/351912345678');
  return url.searchParams.get('text') ?? '';
}

test('WhatsApp: mensagens prontas, lembrete de reunião e ligar/desligar', async ({ page }) => {
  // Não sai para a internet: o wa.me responde com uma página vazia.
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>wa</p>' }));
  await page.request.patch('/api/v1/settings', { data: { features: { whatsapp_templates: true, meetings: true } } });
  const res = await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Florista WA ${run}`, contact_name: 'Rita', phone: '912 345 678', status: 'identificado' },
  });
  expect(res.status(), await res.text()).toBe(201);
  const lead = (await res.json()).data;

  await page.goto(`/leads/${lead.id}`);
  const contact = page.getByRole('navigation', { name: 'Contactar' });
  await contact.getByRole('button', { name: /WhatsApp/ }).click();
  await expect(page.getByRole('menuitem', { name: /Primeiro contacto/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Follow-up/ })).toBeVisible();
  // Sem reunião marcada, o lembrete fica desativado.
  await expect(page.getByRole('menuitem', { name: /Lembrete de reunião/ })).toHaveAttribute('aria-disabled', 'true');

  const first = await openMessage(page, /Primeiro contacto/);
  expect(first).toContain('Olá Rita!');
  expect(first).toContain(`a Florista WA ${run}`);
  expect(first).not.toContain('{{');

  // Lead "Identificado": o aviso oferece marcar como contactado.
  await page.getByRole('button', { name: 'Marcar como contactado' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data.status).toBe('contactado');
  const after = (await (await page.request.get(`/api/v1/leads/${lead.id}`)).json()).data;
  expect(after.channel).toBe('whatsapp');
  await expect(page.getByText('WhatsApp · Modelo: WhatsApp — primeiro contacto')).toBeVisible();

  // Com uma reunião marcada, o lembrete leva o dia, a hora e o local.
  const meeting = await page.request.post(`/api/v1/leads/${lead.id}/meetings`, {
    data: { starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 30, location: 'Google Meet', send_invite: false },
  });
  expect(meeting.status(), await meeting.text()).toBe(201);
  await page.reload();
  await contact.getByRole('button', { name: /WhatsApp/ }).click();
  const reminder = await openMessage(page, /Lembrete de reunião/);
  expect(reminder).toMatch(/reunião de \S+-feira|reunião de (sábado|domingo), \d{2}\/\d{2}, às \d{2}:\d{2}/);
  expect(reminder).toContain('Google Meet');

  // Desligado: volta a ser só a ligação para a conversa.
  await page.request.patch('/api/v1/settings', { data: { features: { whatsapp_templates: false } } });
  try {
    await page.reload();
    const link = contact.getByRole('link', { name: /WhatsApp/ });
    await expect(link).toHaveAttribute('href', 'https://wa.me/351912345678');
    await expect(contact.getByRole('button', { name: /WhatsApp/ })).toHaveCount(0);
  } finally {
    await page.request.patch('/api/v1/settings', { data: { features: { whatsapp_templates: true } } });
  }
});

test('Scripts: modelo de WhatsApp abre no WhatsApp com o texto editado', async ({ page }) => {
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>wa</p>' }));
  const res = await page.request.post('/api/v1/leads?force=true', {
    data: { company_name: `Barbearia WA ${run}`, phone: '+351 912 345 678', status: 'contactado' },
  });
  const lead = (await res.json()).data;
  await page.goto(`/leads/${lead.id}`);
  const options = page.locator('#script-template option', { hasText: 'WhatsApp — follow-up' });
  await page.locator('#script-template').selectOption(await options.first().getAttribute('value'));
  await page.locator('#script-body').fill(`Olá! Mensagem editada ${run}`);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Abrir no WhatsApp' }).click();
  const tab = await popup;
  expect(new URL(tab.url()).searchParams.get('text')).toBe(`Olá! Mensagem editada ${run}`);
  await tab.close();
});
