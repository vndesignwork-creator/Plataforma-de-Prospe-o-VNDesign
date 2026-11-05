import { describe, expect, it } from 'vitest';
import { CardContactSchema, buildCardVCard } from '../src';

describe('cartão de contacto', () => {
  it('vCard com os dados e os caracteres especiais escapados', () => {
    const v = buildCardVCard({ full_name: 'Vá Nancassa', role_title: 'Web designer', company: 'VNDesign, Lda', phone: '+351 912 345 678', email: 'ola@vndesign.pt', website: 'https://vndesign.pt', portfolio_url: null, bio: 'Sites; rápidos' });
    expect(v).toContain('BEGIN:VCARD\r\nVERSION:3.0\r\nN:Nancassa;Vá;;;\r\nFN:Vá Nancassa');
    expect(v).toContain('ORG:VNDesign\\, Lda');
    expect(v).toContain('TEL;TYPE=CELL:+351 912 345 678');
    expect(v).toContain(String.raw`NOTE:Sites\; rápidos`);
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
  });
  it('quem deixa o contacto: nome e email ou telefone', () => {
    expect(CardContactSchema.safeParse({ name: 'Rui' }).success).toBe(false);
    expect(CardContactSchema.safeParse({ name: 'Rui', phone: '912345678' }).success).toBe(true);
  });
});
