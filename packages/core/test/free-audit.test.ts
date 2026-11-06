import { describe, expect, it } from 'vitest';
import { FreeAuditSubmitSchema } from '../src/free-audit';

const base = { email: 'dono@padaria.pt', consent: true };

describe('pedido da análise grátis', () => {
  it('aceita o site sem https e junta-o', () => {
    const r = FreeAuditSubmitSchema.parse({ ...base, website: 'www.padaria.pt' });
    expect(r.website).toBe('https://www.padaria.pt');
  });

  it('um site inválido dá a mensagem, sem rebentar', () => {
    for (const website of ['isto não é um site', 'padaria', 'http://', 'https://padaria.1']) {
      const r = FreeAuditSubmitSchema.safeParse({ ...base, website });
      expect(r.success, website).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/Endereço inválido|Escreva o endereço/);
    }
  });

  it('pede o consentimento', () => {
    const r = FreeAuditSubmitSchema.safeParse({ email: 'a@b.pt', website: 'padaria.pt', consent: false });
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['consent']);
  });
});
