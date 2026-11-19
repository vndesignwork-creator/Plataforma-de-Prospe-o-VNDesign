import { describe, expect, it } from 'vitest';
import { PROPOSAL_EXPIRY_WARN_DAYS, extendedValidity, proposalExpiry, proposalExpiryAlert, proposalExpiryLabel } from '../src';

const HOJE = '2026-11-19';
const enviada = (valid_until: string | null) => ({ status: 'enviada', valid_until });

describe('propostas a perder a validade', () => {
  it('avisa nos dias antes do fim e depois de passar', () => {
    expect(proposalExpiry(enviada('2026-11-19'), HOJE)).toEqual({ state: 'a-expirar', days: 0, on: '2026-11-19' });
    expect(proposalExpiry(enviada('2026-11-22'), HOJE)?.state).toBe('a-expirar');
    expect(proposalExpiry(enviada('2026-11-18'), HOJE)).toEqual({ state: 'expirada', days: -1, on: '2026-11-18' });
  });

  it('não diz nada quando ainda falta muito', () => {
    const longe = new Date(Date.UTC(2026, 10, 19 + PROPOSAL_EXPIRY_WARN_DAYS + 1)).toISOString().slice(0, 10);
    expect(proposalExpiry(enviada(longe), HOJE)).toBeNull();
  });

  it('só conta para propostas enviadas e com validade', () => {
    expect(proposalExpiry({ status: 'rascunho', valid_until: '2026-11-19' }, HOJE)).toBeNull();
    expect(proposalExpiry({ status: 'aceite', valid_until: '2026-11-19' }, HOJE)).toBeNull();
    expect(proposalExpiry({ status: 'recusada', valid_until: '2026-11-19' }, HOJE)).toBeNull();
    expect(proposalExpiry(enviada(null), HOJE)).toBeNull();
  });

  it('escreve em português o que falta', () => {
    expect(proposalExpiryLabel({ state: 'a-expirar', days: 0, on: HOJE })).toBe('Validade termina hoje');
    expect(proposalExpiryLabel({ state: 'a-expirar', days: 1, on: HOJE })).toBe('Validade termina amanhã');
    expect(proposalExpiryLabel({ state: 'a-expirar', days: 3, on: HOJE })).toBe('Validade termina em 3 dias');
    expect(proposalExpiryLabel({ state: 'expirada', days: -1, on: HOJE })).toBe('Validade terminou ontem');
    expect(proposalExpiryLabel({ state: 'expirada', days: -4, on: HOJE })).toBe('Validade terminou há 4 dias');
  });

  it('o aviso diz a empresa e o código da proposta', () => {
    const aviso = proposalExpiryAlert({ state: 'a-expirar', days: 2, on: '2026-11-21' }, 'O Quintal', '2026-007');
    expect(aviso.title).toContain('2026-007');
    expect(aviso.body).toContain('O Quintal');
  });

  it('prolongar conta a partir da validade; se já passou, a partir de hoje', () => {
    expect(extendedValidity('2026-11-30', 14, HOJE)).toBe('2026-12-14');
    expect(extendedValidity('2026-11-10', 14, HOJE)).toBe('2026-12-03');
    expect(extendedValidity(null, 7, HOJE)).toBe('2026-11-26');
  });
});
