import { expect, test, type APIRequestContext } from '@playwright/test';
import { startStubs } from './stubs';

/*
 * Correções da análise (migração 20261014000100 e schemas de atualização).
 * Usa o geocodificador falso de e2e/stubs.ts (GEOCODER_URL=http://127.0.0.1:4620/search).
 */
const run = Date.now().toString(36);
let stop: () => void = () => {};

test.beforeAll(async () => {
  stop = await startStubs();
});
test.afterAll(() => stop());

async function createLead(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post('/api/v1/leads?force=true', { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}
const getLead = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/v1/leads/${id}`)).json()).data;

async function createProposal(request: APIRequestContext, leadId: string) {
  const res = await request.post(`/api/v1/leads/${leadId}/proposals`, {
    data: { title: 'Proposta de website — Teste', intro: 'Olá Sr. Manuel', items: [{ name: 'Site', price: 950 }], discount: 100 },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}

test('lead criado já como "Contactado" fica com 1.º contacto e follow-up agendado', async ({ request }) => {
  const lead = await createLead(request, { company_name: `Contactado Direto ${run}`, status: 'contactado' });
  expect(lead.first_contact_on).not.toBeNull();
  expect(lead.next_action_text).toBe('Enviar follow-up');
  expect(lead.next_action_on > lead.first_contact_on).toBe(true);
});

test('mudar a morada apaga a localização antiga (exceto se foi posta à mão)', async ({ request }) => {
  const lead = await createLead(request, { company_name: `Morada Muda ${run}`, address: 'Rua A 1', city: 'Amadora' });
  await request.post(`/api/v1/leads/${lead.id}/location`);
  expect((await getLead(request, lead.id)).latitude).not.toBeNull();

  await request.patch(`/api/v1/leads/${lead.id}`, { data: { address: 'Rua B 2', city: 'Porto' } });
  const moved = await getLead(request, lead.id);
  expect(moved.latitude).toBeNull();
  expect(moved.geocode_status).toBeNull();

  await request.post(`/api/v1/leads/${lead.id}/location`, { data: { latitude: 41.15, longitude: -8.61 } });
  await request.patch(`/api/v1/leads/${lead.id}`, { data: { address: 'Rua C 3' } });
  expect((await getLead(request, lead.id)).latitude).toBe(41.15);
});

test('mudar só o estado de uma proposta mantém o desconto', async ({ request }) => {
  const lead = await createLead(request, { company_name: `Desconto Fica ${run}` });
  const proposal = await createProposal(request, lead.id);
  expect(proposal.total).toBe(850);
  const res = await request.patch(`/api/v1/proposals/${proposal.id}`, { data: { status: 'aceite' } });
  expect(res.status()).toBe(200);
  const updated = (await res.json()).data;
  expect(updated.discount).toBe(100);
  expect(updated.total).toBe(850);
});

test('juntar leads passa as propostas do duplicado para o principal', async ({ request }) => {
  const primary = await createLead(request, { company_name: `Junta Principal ${run}` });
  const duplicate = await createLead(request, { company_name: `Junta Duplicado ${run}` });
  const proposal = await createProposal(request, duplicate.id);

  const res = await request.post(`/api/v1/leads/${primary.id}/merge`, { data: { duplicate_ids: [duplicate.id] } });
  expect(res.status(), await res.text()).toBe(200);
  const list = (await (await request.get(`/api/v1/leads/${primary.id}/proposals`)).json()).data;
  expect(list.map((p: { id: string }) => p.id)).toContain(proposal.id);
});

test('anonimizar também limpa o texto das propostas', async ({ request }) => {
  const lead = await createLead(request, { company_name: `Anonimiza ${run}`, email: `rgpd-${run}@exemplo.pt` });
  const proposal = await createProposal(request, lead.id);
  expect((await request.post(`/api/v1/leads/${lead.id}/anonymize`, { data: {} })).status()).toBe(200);

  const after = (await (await request.get(`/api/v1/proposals/${proposal.id}`)).json()).data;
  expect(after.title).toBe('Proposta anonimizada');
  expect(after.intro).toBeNull();
  expect(after.total).toBe(850);
});

test('"não contactar" com um email bloqueia outros emails do mesmo domínio', async ({ request }) => {
  const domain = `dnc-${run}.pt`;
  const add = await request.post('/api/v1/do-not-contact', { data: { company_name: `Empresa DNC ${run}`, email: `geral@${domain}` } });
  expect(add.status(), await add.text()).toBe(201);
  const check = await request.post('/api/v1/leads/check-duplicates', { data: { company_name: `Outro Nome ${run}`, email: `info@${domain}` } });
  expect((await check.json()).data.do_not_contact).toHaveLength(1);
});
