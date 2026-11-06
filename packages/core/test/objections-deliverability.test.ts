import { describe, expect, it } from 'vitest';
import { OBJECTIONS, baseObjectionReply, buildObjectionPrompt, expectedSpfInclude } from '../src';

describe('objeções', () => {
  it('resposta-base com o nome e a empresa, sem vírgulas soltas', () => {
    const withName = baseObjectionReply('price', 'phone', { company_name: 'Padaria Sol', contact_name: 'Manuel Silva' });
    expect(withName.reply).toContain('Manuel');
    expect(withName.reply).toContain('Padaria Sol');
    const noName = baseObjectionReply('price', 'phone', { company_name: 'Padaria Sol', contact_name: null });
    expect(noName.reply).not.toMatch(/\{nome\}|,\s*\./);
    expect(noName.reply.startsWith('Percebo perfeitamente.')).toBe(true);
    for (const o of OBJECTIONS) {
      const r = baseObjectionReply(o, 'whatsapp', { company_name: 'X', contact_name: null });
      expect(r.reply).not.toContain('{');
      expect(r.tip.length).toBeGreaterThan(10);
    }
  });
  it('email com saudação e despedida', () => {
    const r = baseObjectionReply('think', 'email', { company_name: 'X', contact_name: 'Ana' });
    expect(r.reply.startsWith('Olá Ana,')).toBe(true);
    expect(r.reply.trim().endsWith('Cumprimentos,')).toBe(true);
  });
  it('o pedido à IA leva a objeção, o canal e os dados do lead (como dados)', () => {
    const p = buildObjectionPrompt(
      { objection: 'has_site', channel: 'whatsapp', detail: 'o meu sobrinho fez', ai: true },
      {
        lead: { company_name: 'Clínica Sorriso', contact_name: 'Rita', sector: 'Saúde', city: 'Amadora', website: 'https://x.pt', problems: 'Lento no telemóvel', status: 'contactado', services: ['site'] },
        auditIssues: ['Sem HTTPS'],
        sender: { name: 'Teste', company: 'VNDesign' },
      },
    );
    expect(p).toContain('“Já tenho site”');
    expect(p).toContain('WhatsApp');
    expect(p).toContain('o meu sobrinho fez');
    expect(p).toMatch(/<dados_do_lead>[\s\S]*Clínica Sorriso[\s\S]*<\/dados_do_lead>/);
  });
});

describe('SPF esperado pelo servidor de envio', () => {
  it('Hostinger, Google e desconhecido', () => {
    expect(expectedSpfInclude('smtp.hostinger.com')?.include).toBe('_spf.mail.hostinger.com');
    expect(expectedSpfInclude('smtp.gmail.com')?.include).toBe('_spf.google.com');
    expect(expectedSpfInclude('mail.exemplo.pt')).toBeNull();
  });
});

describe('oportunidades nos sites dos leads', () => {
  it('em baixo, "Não seguro", lento e sem problema', async () => {
    const { siteOpportunity, opportunityMessage } = await import('../src');
    const base = { is_up: true, down_since: null, ssl_expires_at: '2027-01-01T00:00:00Z', ssl_error: null, response_ms: 800, url: 'https://x.pt', fail_count: 0, active: true };
    const today = '2026-11-06';
    expect(siteOpportunity(base, today)).toBeNull();
    expect(siteOpportunity({ ...base, down_since: '2026-11-06T08:00:00Z', is_up: false }, today)?.kind).toBe('down');
    expect(siteOpportunity({ ...base, ssl_expires_at: '2026-11-01T00:00:00Z' }, today)?.kind).toBe('ssl');
    expect(siteOpportunity({ ...base, ssl_error: 'O certificado não corresponde a este domínio.' }, today)?.label).toMatch(/Não seguro/);
    expect(siteOpportunity({ ...base, response_ms: 7200 }, today)?.label).toBe('O site demora 7 s a responder');
    expect(siteOpportunity({ ...base, active: false, down_since: '2026-11-06T08:00:00Z' }, today)).toBeNull();
    const msg = opportunityMessage('down', { company_name: 'Padaria Sol', contact_name: 'Rita Lopes' }, 'padariasol.pt');
    expect(msg.subject).toBe('O site da Padaria Sol está em baixo');
    expect(msg.body.startsWith('Olá Rita,')).toBe(true);
    expect(msg.body).toContain('padariasol.pt');
  });
});
