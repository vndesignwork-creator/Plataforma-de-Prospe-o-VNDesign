import { describe, expect, it } from 'vitest';
import { prospectorPageAllowed } from '@/lib/role-access';
import { prospectorAllowed, scrubForProspector } from './prospector-access';

const id = '7d9f2c1e-8a1b-4c3d-9e4f-5a6b7c8d9e0f';

describe('prospetor: API', () => {
  it('deixa a parte comercial', () => {
    for (const [m, p] of [
      ['GET', '/leads'],
      ['POST', '/leads'],
      ['PATCH', `/leads/${id}`],
      ['POST', `/leads/${id}/email`],
      ['GET', '/prospecting'],
      ['POST', '/lead-generation'],
      ['GET', '/board'],
      ['GET', '/stats/team'],
      ['HEAD', '/dashboard/today'],
      ['GET', `/leads/${id}/geo`],
      ['POST', `/leads/${id}/geo/faq`],
      ['POST', `/leads/${id}/ai-visibility`],
    ]) {
      expect(prospectorAllowed(m!, p!), `${m} ${p}`).toBe(true);
    }
  });

  it('bloqueia valores, projetos, definições, equipa, exportar e apagar', () => {
    for (const [m, p] of [
      ['DELETE', `/leads/${id}`],
      ['GET', '/dashboard'],
      ['GET', '/projects'],
      ['GET', `/leads/${id}/payments`],
      ['GET', `/leads/${id}/proposals`],
      ['PATCH', '/settings'],
      ['GET', '/team'],
      ['POST', '/team/invites'],
      ['GET', '/leads/export'],
      ['POST', '/imports'],
      ['GET', '/lead-generation/schedules/x/y'],
      ['POST', '/site-form'],
      ['GET', '/team/activity'],
    ]) {
      expect(prospectorAllowed(m!, p!), `${m} ${p}`).toBe(false);
    }
  });

  it('tira o valor estimado de qualquer resposta', () => {
    expect(scrubForProspector({ data: [{ id: 1, estimated_value: 900, lead: { estimated_value: 5 } }] })).toEqual({
      data: [{ id: 1, lead: {} }],
    });
  });
});

describe('prospetor: páginas', () => {
  it('abre as comerciais e as definições da conta', () => {
    for (const p of ['/dashboard', '/leads', `/leads/${id}`, '/prospecao', '/gerar-leads', '/kanban', '/definicoes/assinatura']) {
      expect(prospectorPageAllowed(p), p).toBe(true);
    }
  });
  it('não abre projetos, horas, propostas, juntar nem as outras definições', () => {
    for (const p of ['/projetos', '/horas', '/colaboradores', `/leads/${id}/propostas/nova`, `/leads/${id}/juntar`, '/definicoes/equipa', '/equipa', '/importar']) {
      expect(prospectorPageAllowed(p), p).toBe(false);
    }
  });
});
