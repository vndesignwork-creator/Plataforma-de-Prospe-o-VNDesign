import { describe, expect, it } from 'vitest';
import {
  AI_EMAIL_SYSTEM_PROMPT,
  AiEmailRequestSchema,
  buildAiEmailPrompt,
  finalizeAiEmail,
} from '../src/ai';
import { buildGeocodeQueries, parseNominatimResponse } from '../src/geo';
import {
  ProposalCreateSchema,
  ProposalUpdateSchema,
  ServicePackageUpdateSchema,
  isRecurringPackage,
  itemFromPackage,
  proposalCode,
  proposalTotals,
  suggestProposalIntro,
} from '../src/proposals';

describe('propostas', () => {
  const pkg = { id: '00000000-0000-4000-8000-000000000001', name: 'Profissional', description: 'Site completo', price: 950, features: ['Até 5 páginas'] };

  it('calcula totais com desconto e itens mensais à parte', () => {
    const items = [
      itemFromPackage(pkg),
      { ...itemFromPackage({ ...pkg, name: 'Logótipo', price: 120.555 }), quantity: 2 },
      itemFromPackage({ ...pkg, name: 'Manutenção mensal', price: 45 }, true),
    ];
    expect(proposalTotals(items, 100)).toEqual({ subtotal: 1191.11, discount: 100, total: 1091.11, monthly: 45 });
    // O desconto nunca passa o subtotal.
    expect(proposalTotals([itemFromPackage({ ...pkg, price: 50 })], 80).total).toBe(0);
  });

  it('numera como AAAA-NNN e reconhece pacotes mensais', () => {
    expect(proposalCode(7, '2026-10-09T10:00:00Z')).toBe('2026-007');
    expect(isRecurringPackage({ name: 'Manutenção mensal' })).toBe(true);
    expect(isRecurringPackage({ name: 'Essencial' })).toBe(false);
  });

  it('valida o pedido e arredonda os valores', () => {
    const parsed = ProposalCreateSchema.parse({ title: ' Proposta ', items: [{ name: 'Site', price: 10.005, features: ['a', ''] }] });
    expect(parsed.title).toBe('Proposta');
    expect(parsed.items[0]).toMatchObject({ price: 10.01, quantity: 1, recurring: false, features: ['a'] });
    expect(ProposalCreateSchema.safeParse({ title: 'X', items: [] }).success).toBe(false);
  });

  it('sugere o texto inicial a partir da análise', () => {
    const intro = suggestProposalIntro({
      companyName: 'Restaurante O Lagar',
      contactName: 'Sr. Manuel',
      website: 'https://olagar.pt',
      issues: [
        { message: 'Não usa HTTPS — o browser mostra «Não seguro».', severity: 'high' },
        { message: 'Impede o zoom no telemóvel.', severity: 'low' },
      ],
      approachAngle: 'Reservas online',
    });
    expect(intro).toContain('Olá Sr. Manuel,');
    expect(intro).toContain('• Não usa HTTPS — o browser mostra «Não seguro»');
    expect(intro).not.toContain('zoom');
    expect(intro).toContain('Proposta de foco: Reservas online');
  });
});

describe('email com IA', () => {
  it('monta o pedido com os dados do lead entre etiquetas', () => {
    const req = AiEmailRequestSchema.parse({ kind: 'follow_up', instructions: 'Sou da Amadora' });
    const prompt = buildAiEmailPrompt(req, {
      lead: { company_name: 'Clínica Sá', city: 'Amadora', website: null, pagespeed: 34, first_contact_on: '2026-10-06', previous_subject: 'Uma ideia' },
      auditIssues: [{ message: 'Sem HTTPS.' }],
      sender: { name: 'Vasco', website: 'https://vndesign.pt' },
    });
    expect(prompt).toContain('Follow-up curto');
    expect(prompt).toContain('Indicações do designer: Sou da Amadora');
    expect(prompt).toMatch(/<dados_do_lead>\nEmpresa: Clínica Sá[\s\S]*Website: não tem site próprio[\s\S]*- Sem HTTPS\.[\s\S]*Data do primeiro contacto: 06\/10\/2026[\s\S]*<\/dados_do_lead>/);
    expect(AI_EMAIL_SYSTEM_PROMPT).toContain('português europeu');
  });

  it('sem análise quando use_audit=false', () => {
    const req = AiEmailRequestSchema.parse({ use_audit: false });
    const prompt = buildAiEmailPrompt(req, { lead: { company_name: 'X' }, auditIssues: [{ message: 'Sem HTTPS.' }], sender: {} });
    expect(prompt).not.toContain('Sem HTTPS');
  });

  it('junta assinatura e opt-out ao corpo', () => {
    const out = finalizeAiEmail({ subject: '  Ideia  para o site ', body: 'Olá,\r\n\r\n\r\nTexto.\n\nCumprimentos,\n' }, 'Vasco\nVNDesign', 'Se não quiser receber mais contactos, basta responder.');
    expect(out.subject).toBe('Ideia para o site');
    expect(out.body).toBe('Olá,\n\nTexto.\n\nCumprimentos,\n\nVasco\nVNDesign\n\nSe não quiser receber mais contactos, basta responder.');
  });
});

describe('geocodificação', () => {
  it('tenta morada, empresa + cidade e só a cidade', () => {
    expect(buildGeocodeQueries({ company_name: 'O Lagar', address: 'Rua Elias Garcia 10', city: 'Amadora' })).toEqual([
      { q: 'Rua Elias Garcia 10, Amadora, Portugal', approximate: false },
      { q: 'O Lagar, Amadora, Portugal', approximate: false },
      { q: 'Amadora, Portugal', approximate: true },
    ]);
    expect(buildGeocodeQueries({ company_name: 'X', address: 'Av. X 1, 2700-001 Amadora', city: 'Amadora' })[0]!.q).toBe(
      'Av. X 1, 2700-001 Amadora, Portugal',
    );
    expect(buildGeocodeQueries({ company_name: 'X' })).toEqual([]);
  });

  it('lê a resposta do Nominatim', () => {
    expect(parseNominatimResponse([{ lat: '38.7538', lon: '-9.2308', display_name: 'Amadora' }])).toEqual({
      latitude: 38.7538,
      longitude: -9.2308,
      label: 'Amadora',
    });
    expect(parseNominatimResponse([])).toBeNull();
    expect(parseNominatimResponse({ error: 'x' })).toBeNull();
  });
});

describe('atualizações parciais', () => {
  it('não acrescentam campos que não foram enviados (desconto, pontos, recomendado)', () => {
    expect(ProposalUpdateSchema.parse({ status: 'aceite' })).toEqual({ status: 'aceite' });
    expect(ServicePackageUpdateSchema.parse({ archived: true })).toEqual({ archived: true });
  });

  it('continuam a validar o que é enviado', () => {
    expect(ProposalUpdateSchema.parse({ discount: 1.005 }).discount).toBe(1.01);
    expect(ServicePackageUpdateSchema.parse({ features: ['Site', ' '] }).features).toEqual(['Site']);
  });
});
