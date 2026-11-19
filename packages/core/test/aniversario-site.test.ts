import { describe, expect, it } from 'vitest';
import { ANNIVERSARY_REMIND_DAYS, anniversaryDue, anniversaryTaskTitle, buildAnniversaryEmail, nextAnniversary } from '../src/anniversary';

describe('data do aniversário', () => {
  it('o primeiro é um ano depois da entrega', () => {
    expect(nextAnniversary('2025-06-10T10:00:00Z', '2026-01-05')).toEqual({ on: '2026-06-10', years: 1 });
  });

  it('passado o dia, conta o do ano seguinte', () => {
    expect(nextAnniversary('2025-06-10', '2026-06-11')).toEqual({ on: '2027-06-10', years: 2 });
  });

  it('no próprio dia é hoje', () => {
    expect(nextAnniversary('2025-06-10', '2026-06-10')).toEqual({ on: '2026-06-10', years: 1 });
  });

  it('29 de fevereiro passa para 28 nos anos sem 29', () => {
    expect(nextAnniversary('2024-02-29', '2026-01-01').on).toBe('2026-02-28');
  });
});

describe('quando avisar', () => {
  it('avisa a partir de 7 dias antes', () => {
    expect(ANNIVERSARY_REMIND_DAYS).toBe(7);
    expect(anniversaryDue('2025-06-10', '2026-06-02')).toBeNull();
    expect(anniversaryDue('2025-06-10', '2026-06-03')).toEqual({ on: '2026-06-10', years: 1 });
    expect(anniversaryDue('2025-06-10', '2026-06-10')?.years).toBe(1);
  });

  it('não avisa antes do primeiro ano', () => {
    expect(anniversaryDue('2026-01-10', '2026-02-01')).toBeNull();
  });

  it('o título leva o número de anos (para não repetir)', () => {
    expect(anniversaryTaskTitle('Padaria Sol', 1)).toBe('Aniversário do site: 1 ano (Padaria Sol)');
    expect(anniversaryTaskTitle('Padaria Sol', 3)).toBe('Aniversário do site: 3 anos (Padaria Sol)');
  });
});

describe('email de aniversário', () => {
  const email = buildAnniversaryEmail({
    company: 'Padaria Sol',
    contactName: 'Ana',
    years: 1,
    on: '2026-06-10',
    sender: { name: 'Va', company: 'VNDesign' },
  });

  it('fala do cliente, do tempo e termina sem assinatura', () => {
    expect(email.subject).toBe('O site da Padaria Sol faz 1 ano');
    expect(email.body).toContain('Olá Ana,');
    expect(email.body).toContain('10/06/2026');
    expect(email.body.trimEnd().endsWith('Cumprimentos,')).toBe(true);
  });

  it('sem nome do contacto usa um "Olá," simples', () => {
    const anon = buildAnniversaryEmail({ company: 'Clínica Norte', contactName: null, years: 2, on: '2026-03-01', sender: { name: null, company: null } });
    expect(anon.body.startsWith('Olá,')).toBe(true);
    expect(anon.subject).toBe('O site da Clínica Norte faz 2 anos');
  });
});
