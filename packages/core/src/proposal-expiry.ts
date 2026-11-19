/**
 * Propostas a expirar: uma proposta enviada tem validade ("válida até"), mas
 * ninguém se lembra dela no dia certo. Aqui está a regra — a plataforma avisa
 * uns dias antes e no dia a seguir a terminar, e deixa prolongar a validade com
 * um clique.
 */
import { addDays, daysBetween } from './format';

/** Quantos dias antes do fim da validade se avisa. */
export const PROPOSAL_EXPIRY_WARN_DAYS = 3;

/** Prolongar a validade: as hipóteses do botão. */
export const PROPOSAL_EXTEND_DAYS = [7, 14, 30] as const;

export type ProposalExpiryState = 'a-expirar' | 'expirada';

export interface ProposalExpiry {
  state: ProposalExpiryState;
  /** Dias até ao fim da validade (negativo = já passou). */
  days: number;
  /** O último dia de validade (AAAA-MM-DD). */
  on: string;
}

/**
 * O estado da validade de uma proposta, ou null quando não há nada a dizer
 * (rascunho, já aceite ou recusada, sem validade, ou ainda falta muito).
 */
export function proposalExpiry(
  proposal: { status: string; valid_until: string | null },
  today: string,
): ProposalExpiry | null {
  if (proposal.status !== 'enviada' || !proposal.valid_until) return null;
  const days = daysBetween(today, proposal.valid_until);
  if (days < 0) return { state: 'expirada', days, on: proposal.valid_until };
  if (days <= PROPOSAL_EXPIRY_WARN_DAYS) return { state: 'a-expirar', days, on: proposal.valid_until };
  return null;
}

/** "Termina hoje", "Termina amanhã", "Termina em 3 dias", "Terminou ontem", "Terminou há 4 dias". */
export function proposalExpiryLabel(expiry: ProposalExpiry): string {
  const { days } = expiry;
  if (days === 0) return 'Validade termina hoje';
  if (days === 1) return 'Validade termina amanhã';
  if (days > 1) return `Validade termina em ${days} dias`;
  if (days === -1) return 'Validade terminou ontem';
  return `Validade terminou há ${Math.abs(days)} dias`;
}

/** Aviso no sino: título e texto. */
export function proposalExpiryAlert(expiry: ProposalExpiry, company: string, code: string): { title: string; body: string } {
  const terminou = expiry.state === 'expirada';
  return {
    title: terminou ? `⌛ Proposta ${code} sem validade` : `⏳ Proposta ${code} a terminar`,
    body: terminou
      ? `${proposalExpiryLabel(expiry).toLowerCase()} e a ${company} ainda não respondeu. Dá para prolongar a validade ou ligar.`
      : `${proposalExpiryLabel(expiry)} e a ${company} ainda não respondeu. Boa altura para um toque.`,
  };
}

/**
 * A nova validade ao prolongar: conta a partir de hoje quando já passou (não
 * vale a pena prolongar para uma data que já lá vai) e, se ainda está válida, a
 * partir do último dia.
 */
export function extendedValidity(validUntil: string | null, days: number, today: string): string {
  const from = validUntil && daysBetween(today, validUntil) > 0 ? validUntil : today;
  return addDays(from, days);
}
