import { describe, expect, it } from 'vitest';
import {
  CLIENT_FILTERS,
  CLIENT_RENEWAL_SOON_DAYS,
  clientMatches,
  clientProjectsLabel,
  sortClients,
  type Client,
} from '../src/clients';

const TODAY = '2026-11-18';

function client(over: Partial<Client> & { name?: string; number?: number } = {}): Client {
  const { name, number, ...rest } = over;
  return {
    lead: { id: `id-${number ?? 1}`, number: number ?? 1, company_name: name ?? 'Padaria Sol' } as Client['lead'],
    projects: { total: 1, active: 1, completed: 0 },
    payments: { total: 1000, paid: 500, outstanding: 500, overdue: 0, overdue_count: 0 },
    next_task: null,
    renewal: null,
    brand_kit: false,
    client_since: '2026-01-10',
    value: 1000,
    ...rest,
  };
}

describe('filtros dos clientes', () => {
  it('"todos" deixa passar tudo', () => {
    expect(CLIENT_FILTERS[0]).toBe('todos');
    expect(clientMatches(client({ projects: { total: 2, active: 0, completed: 2 } }), 'todos', TODAY)).toBe(true);
  });

  it('"em curso" só os clientes com projeto a decorrer', () => {
    expect(clientMatches(client(), 'em_curso', TODAY)).toBe(true);
    expect(clientMatches(client({ projects: { total: 3, active: 0, completed: 3 } }), 'em_curso', TODAY)).toBe(false);
  });

  it('"pagamentos" só com pagamentos em atraso', () => {
    expect(clientMatches(client(), 'pagamentos', TODAY)).toBe(false);
    expect(clientMatches(client({ payments: { total: 1000, paid: 0, outstanding: 1000, overdue: 300, overdue_count: 1 } }), 'pagamentos', TODAY)).toBe(true);
  });

  it('"renovações" só as que chegam nos próximos 30 dias (ou já passaram)', () => {
    const soon = client({ renewal: { next_due_on: '2026-12-01', monthly: 10, count: 1 } });
    const far = client({ renewal: { next_due_on: '2027-06-01', monthly: 10, count: 1 } });
    const late = client({ renewal: { next_due_on: '2026-10-01', monthly: 10, count: 1 } });
    expect(CLIENT_RENEWAL_SOON_DAYS).toBe(30);
    expect(clientMatches(soon, 'renovacoes', TODAY)).toBe(true);
    expect(clientMatches(far, 'renovacoes', TODAY)).toBe(false);
    expect(clientMatches(late, 'renovacoes', TODAY)).toBe(true);
    expect(clientMatches(client(), 'renovacoes', TODAY)).toBe(false);
  });
});

describe('ordem dos clientes', () => {
  const a = client({ name: 'Zebra Lda', number: 1, client_since: '2026-01-01', value: 500, payments: { total: 500, paid: 500, outstanding: 0, overdue: 0, overdue_count: 0 } });
  const b = client({ name: 'Alfa Lda', number: 2, client_since: '2026-06-01', value: 9000, payments: { total: 9000, paid: 0, outstanding: 9000, overdue: 0, overdue_count: 0 } });
  const list = [a, b];

  it('mais recentes primeiro, por omissão', () => {
    expect(sortClients(list, 'recentes').map((c) => c.lead.company_name)).toEqual(['Alfa Lda', 'Zebra Lda']);
  });

  it('por nome, por valor e por receber', () => {
    expect(sortClients(list, 'nome').map((c) => c.lead.company_name)).toEqual(['Alfa Lda', 'Zebra Lda']);
    expect(sortClients(list, 'valor').map((c) => c.value)).toEqual([9000, 500]);
    expect(sortClients(list, 'por_receber').map((c) => c.payments.outstanding)).toEqual([9000, 0]);
  });

  it('não mexe na lista original', () => {
    const before = [...list];
    sortClients(list, 'nome');
    expect(list).toEqual(before);
  });
});

describe('resumo dos projetos', () => {
  it('conta os projetos e os que estão em curso', () => {
    expect(clientProjectsLabel({ total: 1, active: 1, completed: 0 })).toBe('1 projeto · 1 em curso');
    expect(clientProjectsLabel({ total: 3, active: 0, completed: 3 })).toBe('3 projetos');
  });
});
