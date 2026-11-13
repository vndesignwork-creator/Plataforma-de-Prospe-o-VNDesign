/**
 * Avisos periódicos (cron diário): à segunda-feira, os leads a arrefecer; no dia 1
 * de cada mês, o lembrete do ponto de situação dos projetos em curso.
 */
import type { LeadStatus } from './enums';
import { todayIso } from './format';

/** Em conversa: já responderam, mas ainda não fecharam. */
export const COOLING_STATUSES: readonly LeadStatus[] = ['respondeu', 'proposta_enviada'];
/** Sem mudar de fase há mais de isto, o lead está "a arrefecer". */
export const COOLING_DAYS = 14;

/** A lista de leads com os mesmos filtros do aviso. */
export const COOLING_LEADS_URL = `/leads?status=${COOLING_STATUSES.join(',')}&parado=${COOLING_DAYS}`;

/** 1 = segunda-feira … 7 = domingo, em Lisboa. */
export function lisbonWeekday(now: Date = new Date()): number {
  const day = new Date(`${todayIso(now)}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Dia do mês em Lisboa (1–31). */
export const lisbonDayOfMonth = (now: Date = new Date()): number => Number(todayIso(now).slice(8, 10));

const names = (list: readonly string[], total: number) => {
  const shown = list.slice(0, 3);
  const rest = total - shown.length;
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}` : (shown[0] ?? '');
};

export function coolingAlert(total: number, companies: readonly string[]): { title: string; body: string; url: string } {
  return {
    title: `🧊 ${total} lead${total === 1 ? '' : 's'} a arrefecer`,
    body: `Em conversa e sem novidades há mais de ${COOLING_DAYS} dias: ${names(companies, total)}.`,
    url: COOLING_LEADS_URL,
  };
}

export const MONTHLY_UPDATE_TASK = 'Enviar o ponto de situação do mês';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "novembro" (o mês em Lisboa). */
export const lisbonMonthName = (now: Date = new Date()): string => MONTHS[Number(todayIso(now).slice(5, 7)) - 1]!;

export function monthlyUpdateAlert(total: number, companies: readonly string[], now: Date = new Date()): { title: string; body: string; url: string } {
  return {
    title: `📨 Ponto de situação de ${lisbonMonthName(now)}`,
    body: `${total === 1 ? 'Um projeto em curso' : `${total} projetos em curso`}: ${names(companies, total)}. Ficou uma tarefa em cada um.`,
    url: '/projetos',
  };
}
