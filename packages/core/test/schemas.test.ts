import { describe, expect, it } from 'vitest';
import { ActivityCreateSchema, LeadCreateSchema, LeadListQuerySchema, LeadUpdateSchema } from '../src/schemas';

describe('LeadCreateSchema', () => {
  it('exige o nome da empresa', () => {
    const r = LeadCreateSchema.safeParse({ company_name: '  ' });
    expect(r.success).toBe(false);
  });

  it('converte vazios em null e acrescenta https://', () => {
    const r = LeadCreateSchema.parse({
      company_name: 'Os Martins',
      website: 'osmartins.pt',
      email: '',
      city: ' Amadora ',
      next_action_on: '',
      estimated_value: 1200.456,
    });
    expect(r.website).toBe('https://osmartins.pt');
    expect(r.email).toBeNull();
    expect(r.city).toBe('Amadora');
    expect(r.next_action_on).toBeNull();
    expect(r.estimated_value).toBe(1200.46);
  });

  it('rejeita email, pagespeed e datas inválidos com mensagens em pt-PT', () => {
    const r = LeadCreateSchema.safeParse({
      company_name: 'X',
      email: 'nao-e-email',
      pagespeed: 120,
      suggested_on: '31/02/2026',
    });
    expect(r.success).toBe(false);
    const fields = r.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['email', 'pagespeed', 'suggested_on']));
    expect(r.error!.issues.find((i) => i.path[0] === 'email')!.message).toBe('Email inválido.');
  });

  it('rejeita estados desconhecidos', () => {
    expect(LeadCreateSchema.safeParse({ company_name: 'X', status: 'ganho' }).success).toBe(false);
  });
});

describe('LeadUpdateSchema', () => {
  it('aceita alterações parciais', () => {
    expect(LeadUpdateSchema.parse({ status: 'contactado' })).toEqual({ status: 'contactado' });
  });
});

describe('LeadListQuerySchema', () => {
  it('lê listas separadas por vírgulas e valores por omissão', () => {
    const q = LeadListQuerySchema.parse({ status: 'contactado,respondeu', page: '2' });
    expect(q.status).toEqual(['contactado', 'respondeu']);
    expect(q.page).toBe(2);
    expect(q.limit).toBe(50);
    expect(q.sort).toBe('number');
  });
  it('rejeita ordenação por campos não permitidos', () => {
    expect(LeadListQuerySchema.safeParse({ sort: 'search_text' }).success).toBe(false);
  });
});

describe('ActivityCreateSchema', () => {
  it('nota exige texto', () => {
    expect(ActivityCreateSchema.safeParse({ type: 'note', body: '' }).success).toBe(false);
    expect(ActivityCreateSchema.safeParse({ type: 'email_copied' }).success).toBe(true);
    expect(ActivityCreateSchema.safeParse({ type: 'merged' }).success).toBe(false);
  });
});
