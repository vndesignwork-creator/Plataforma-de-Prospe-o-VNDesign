/**
 * Aniversário do site do cliente: um ano depois de o projeto ficar concluído
 * (e em cada ano a seguir), fica uma tarefa e um aviso, com o email já escrito.
 * É a desculpa natural para voltar a falar com clientes antigos — de onde vem
 * o trabalho mais fácil.
 */
import { formatDate } from './format';

/** Quantos dias antes do aniversário aparece a tarefa. */
export const ANNIVERSARY_REMIND_DAYS = 7;

/** Data do aniversário seguinte (29/02 passa para 28/02 nos anos sem 29). */
export function nextAnniversary(completedAt: string, today: string): { on: string; years: number } {
  const [cy, cm, cd] = completedAt.slice(0, 10).split('-').map(Number) as [number, number, number];
  const year = Number(today.slice(0, 4));
  const build = (y: number) => {
    const last = new Date(Date.UTC(y, cm, 0)).getUTCDate();
    return `${y}-${String(cm).padStart(2, '0')}-${String(Math.min(cd, last)).padStart(2, '0')}`;
  };
  for (let y = Math.max(year, cy + 1); y <= year + 1; y++) {
    const on = build(y);
    if (on >= today) return { on, years: y - cy };
  }
  const on = build(year + 1);
  return { on, years: year + 1 - cy };
}

/** Está na altura de avisar? (a partir de N dias antes, e nunca antes do 1.º ano). */
export function anniversaryDue(completedAt: string, today: string, remindDays = ANNIVERSARY_REMIND_DAYS): { on: string; years: number } | null {
  const next = nextAnniversary(completedAt, today);
  if (next.years < 1) return null;
  const remindOn = new Date(`${next.on}T12:00:00Z`);
  remindOn.setUTCDate(remindOn.getUTCDate() - remindDays);
  return remindOn.toISOString().slice(0, 10) <= today ? next : null;
}

/** "Aniversário do site: 1 ano (Padaria Sol)" — título da tarefa (e marca para não repetir). */
export function anniversaryTaskTitle(company: string, years: number): string {
  return `Aniversário do site: ${years} ano${years === 1 ? '' : 's'} (${company})`.slice(0, 300);
}

export interface AnniversaryEmailInput {
  company: string;
  contactName: string | null;
  years: number;
  on: string;
  sender: { name: string | null; company: string | null };
}

/** O email de aniversário, já escrito (o utilizador pode mudar tudo antes de enviar). */
export function buildAnniversaryEmail(input: AnniversaryEmailInput): { subject: string; body: string } {
  const anos = `${input.years} ano${input.years === 1 ? '' : 's'}`;
  const hello = input.contactName ? `Olá ${input.contactName},` : 'Olá,';
  const subject = `O site da ${input.company} faz ${anos}`.slice(0, 120);
  const body = [
    hello,
    '',
    `Faz ${anos} a ${formatDate(input.on)} que o site da ${input.company} está no ar. Espero que tenha corrido bem!`,
    '',
    'Aproveito para perguntar: há alguma coisa que queira mudar ou acrescentar? Costumo aproveitar esta altura para rever os textos e as fotografias, verificar a velocidade e confirmar que está tudo a funcionar bem no telemóvel.',
    '',
    'Se quiser, digo-lhe o que encontrei numa chamada rápida, sem compromisso.',
    '',
    'Cumprimentos,',
  ].join('\n');
  return { subject, body };
}
