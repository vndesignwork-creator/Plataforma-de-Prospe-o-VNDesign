/**
 * Leads abertos há pouco (neste browser), para a pesquisa rápida mostrar sem
 * escrever nada. Sem localStorage (janela privada), fica vazio.
 */
import type { LeadStatus } from '@vndesign/core';

export type RecentLead = { id: string; number: number; company_name: string; status: LeadStatus; project_title: string | null };

const KEY = 'vnd.recent-leads';
const MAX = 8;

export function readRecentLeads(): RecentLead[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentLead[];
    return Array.isArray(list) ? list.filter((l) => l && typeof l.id === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Põe o lead no topo dos recentes (chamado ao abrir a ficha). */
export function rememberLead(lead: Omit<RecentLead, 'project_title'> & { project_title?: string | null }) {
  try {
    const next = [
      { id: lead.id, number: lead.number, company_name: lead.company_name, status: lead.status, project_title: lead.project_title ?? null },
      ...readRecentLeads().filter((l) => l.id !== lead.id),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Sem localStorage: não guarda.
  }
}

/** Tira um lead dos recentes (ex.: depois de apagado ou juntado). */
export function forgetLead(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readRecentLeads().filter((l) => l.id !== id)));
  } catch {
    // ignora
  }
}
