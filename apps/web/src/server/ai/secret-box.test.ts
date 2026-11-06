import { describe, expect, it } from 'vitest';
import { signValue, verifySigned } from './secret-box';

describe('assinaturas', () => {
  it('só aceita o valor assinado, e só para o mesmo fim', () => {
    process.env.AI_KEYS_SECRET ||= 'segredo-de-teste';
    const signed = signValue('ws.lead.2026-01-01T00:00:00Z', 'free-audit-request');
    expect(verifySigned(signed, 'free-audit-request')).toBe('ws.lead.2026-01-01T00:00:00Z');
    expect(verifySigned(signed, 'outro-fim')).toBeNull();
    const [encoded, mac] = signed.split('.');
    expect(verifySigned(`${Buffer.from('ws.outro.2026').toString('base64url')}.${mac}`, 'free-audit-request')).toBeNull();
    expect(verifySigned(`${encoded}.x${mac!.slice(1)}`, 'free-audit-request')).toBeNull();
    expect(verifySigned('lixo', 'free-audit-request')).toBeNull();
  });
});
