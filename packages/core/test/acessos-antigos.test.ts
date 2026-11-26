import { describe, expect, it } from 'vitest';
import { ACCESS_STALE_DAYS, accessIsStale, accessSecretAge } from '../src/brand-kit';

const hoje = new Date('2026-11-26T12:00:00Z');
const haDias = (dias: number) => new Date(hoje.getTime() - dias * 86_400_000).toISOString();

describe('acessos: idade da palavra-passe', () => {
  it('sem palavra-passe guardada não há idade nem aviso', () => {
    const acesso = { has_secret: false, secret_changed_at: haDias(900) };
    expect(accessSecretAge(acesso, hoje)).toBeNull();
    expect(accessIsStale(acesso, hoje)).toBe(false);
  });

  it('sem saber quando mudou (acessos antigos) não avisa', () => {
    expect(accessIsStale({ has_secret: true, secret_changed_at: null }, hoje)).toBe(false);
  });

  it('conta os dias desde a última troca', () => {
    expect(accessSecretAge({ has_secret: true, secret_changed_at: haDias(40) }, hoje)).toBe(40);
  });

  it('avisa a partir de um ano', () => {
    expect(accessIsStale({ has_secret: true, secret_changed_at: haDias(ACCESS_STALE_DAYS - 1) }, hoje)).toBe(false);
    expect(accessIsStale({ has_secret: true, secret_changed_at: haDias(ACCESS_STALE_DAYS) }, hoje)).toBe(true);
    expect(accessIsStale({ has_secret: true, secret_changed_at: haDias(400) }, hoje)).toBe(true);
  });

  it('data inválida não rebenta nem avisa', () => {
    expect(accessIsStale({ has_secret: true, secret_changed_at: 'não é uma data' }, hoje)).toBe(false);
  });
});
