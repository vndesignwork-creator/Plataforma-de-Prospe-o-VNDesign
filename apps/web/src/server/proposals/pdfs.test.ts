import { WorkspaceSettingsSchema, type LeadContract, type Proposal, type Signature, type SiteAudit } from '@vndesign/core';
import { describe, expect, it } from 'vitest';
import { renderContractPdf } from './contract-pdf';
import { renderDiagnosisPdf } from './diagnosis-pdf';
import { renderProposalPdf } from './pdf';

/** Os PDFs têm de sair também com o mínimo de dados (campos vazios, listas vazias). */
const NOW = '2026-11-06T10:00:00.000Z';
const ID = '00000000-0000-4000-8000-000000000000';
const signature: Signature = { full_name: 'Teste', role_title: null, company: null, phone: null, email: null, website: null, portfolio_url: null, project_links: [] };
const isPdf = (buf: Buffer) => expect(buf.subarray(0, 4).toString()).toBe('%PDF');

describe('PDFs com dados mínimos', () => {
  it('proposta sem itens, sem introdução nem condições', async () => {
    const proposal: Proposal = {
      id: ID, lead_id: ID, number: 1, code: '2026-001', title: 'Proposta', intro: null, items: [], discount: 0, total: 0,
      valid_until: null, payment_terms: null, notes: null, status: 'rascunho', sent_at: null, created_at: NOW, updated_at: NOW,
    };
    const settings = WorkspaceSettingsSchema.parse({}).proposal;
    isPdf(await renderProposalPdf({ proposal, lead: { company_name: 'Teste', contact_name: null, city: null, website: null, email: null }, signature, settings }));
    // Com testemunhos (um sem autor).
    const testimonials = [
      { quote: 'Trabalho rápido e muito profissional.', rating: 5, author: 'Cliente Teste, Gerente', company: 'Empresa Teste' },
      { quote: 'Recomendo.', rating: 4, author: '', company: 'Outra' },
    ];
    isPdf(await renderProposalPdf({ proposal, lead: { company_name: 'Teste', contact_name: null, city: null, website: null, email: null }, signature, settings, testimonials }));
  }, 30_000);

  it('contrato com as partes só com o nome e uma cláusula vazia; e já aceite', async () => {
    const party = { name: 'Teste', company: null, nif: null, address: null, email: null, phone: null };
    const contract: LeadContract = {
      id: ID, lead_id: ID, proposal_id: null, number: 1, title: 'Contrato', status: 'rascunho', token: 'x',
      content: { provider: party, client: party, sections: [{ title: 'Objeto', body: '' }] },
      sent_at: null, accepted_at: null, accepted_name: null, created_at: NOW, updated_at: NOW,
    };
    isPdf(await renderContractPdf(contract));
    isPdf(await renderContractPdf({ ...contract, status: 'aceite', accepted_at: NOW, accepted_name: 'Teste' }));
  }, 30_000);

  it('diagnóstico sem métricas, sem problemas e sem imagens', async () => {
    const audit = {
      id: ID, lead_id: ID, url: 'https://exemplo.pt', final_url: null, status: 'done', http_status: null, response_ms: null, https: null,
      ssl_valid: null, ssl_issuer: null, ssl_expires_at: null, ssl_error: null, has_viewport: null, zoom_blocked: null, pagespeed_mobile: null,
      metrics: {}, title: null, meta_description: null, cms: null, copyright_year: null, issues: [], suggested_problems: null,
      suggested_mobile: null, error: null, screenshots: [], created_at: NOW,
    } as unknown as SiteAudit;
    isPdf(await renderDiagnosisPdf({ audit, lead: { company_name: 'Teste', contact_name: null, city: null, approach_angle: null, services: [] }, services: [], signature }));
  }, 30_000);
});
