/**
 * Voltar a falar com quem já conhecemos e chegar mais depressa a quem é novo:
 *  - "Agora não": em que dia o lead volta à prospeção;
 *  - clientes antigos (projeto concluído há meses): lista e email pronto;
 *  - novo lead a partir de um texto ditado ou colado (a IA preenche a ficha);
 *  - contacto do lead para guardar no telemóvel (vCard);
 *  - avisos (tarefas e @menções) num email para quem não tem notificações.
 */
import { z } from 'zod';
import { addMonths } from './project-tools';
import type { Notification } from './team-work';

// -----------------------------------------------------------------------------
// "Agora não" → voltar a tentar
// -----------------------------------------------------------------------------
export const RETRY_MONTHS = [1, 3, 6] as const;
export const DEFAULT_RETRY_MONTHS = 3;

/** Dia em que o lead volta à prospeção (daqui a N meses). */
export function retryDate(today: string, months: number): string {
  return addMonths(today, months);
}

// -----------------------------------------------------------------------------
// Clientes antigos
// -----------------------------------------------------------------------------
export const RECONNECT_TEMPLATE = 'Voltar a contactar';
export const RECONNECT_MONTHS = [3, 6, 12] as const;
/** Início do título da tarefa criada ao concluir um projeto ("Propor um novo serviço daqui a N meses"). */
export const UPSELL_TASK_PREFIX = 'Propor um novo serviço';

export const ReconnectQuerySchema = z
  .object({ months: z.coerce.number().int().min(1).max(36).default(6).meta({ description: 'Último projeto concluído há mais de N meses' }) })
  .meta({ id: 'ReconnectQuery' });
export type ReconnectQuery = z.output<typeof ReconnectQuerySchema>;

export const ReconnectClientSchema = z
  .object({
    lead: z.object({
      id: z.uuid(),
      number: z.int(),
      company_name: z.string(),
      contact_name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    last_completed_at: z.string().meta({ description: 'Quando foi concluído o último projeto' }),
    last_project: z.string().nullable().meta({ description: 'Nome do último projeto (ou os serviços)' }),
    projects: z.int(),
  })
  .meta({ id: 'ReconnectClient' });
export type ReconnectClient = z.infer<typeof ReconnectClientSchema>;

/** Meses inteiros entre duas datas (AAAA-MM-DD…). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.slice(0, 10).split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.slice(0, 10).split('-').map(Number) as [number, number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
}

export function buildReconnectEmail(input: {
  company: string;
  contact: string | null;
  lastProject: string | null;
  completedAt: string;
  today: string;
  signature: string | null;
}): { subject: string; body: string } {
  const months = monthsBetween(input.completedAt, input.today);
  const when = months >= 12 ? `Já passou ${months >= 24 ? `mais de ${Math.floor(months / 12)} anos` : 'mais de um ano'}` : `Já passaram ${months} meses`;
  const project = input.lastProject ? `o projeto ${input.lastProject}` : 'o nosso último projeto';
  const lines = [
    input.contact ? `Olá ${input.contact.split(' ')[0]},` : 'Boa tarde,',
    '',
    `${when} desde que terminámos ${project} — espero que esteja tudo a correr bem!`,
    '',
    'Queria saber se precisa de alguma coisa:',
    '• atualizar o site ou acrescentar conteúdos;',
    '• manutenção e segurança do site;',
    '• redes sociais, novos materiais ou uma campanha;',
    '• aparecer melhor no Google e nas IAs (ChatGPT, Gemini…).',
    '',
    'Se fizer sentido, marcamos uma conversa rápida de 15 minutos.',
    '',
    'Cumprimentos,',
  ];
  if (input.signature) lines.push(input.signature);
  return { subject: `Como está a correr? — ${input.company}`, body: lines.join('\n').trim() };
}

// -----------------------------------------------------------------------------
// Novo lead a partir de texto (ditado ou colado)
// -----------------------------------------------------------------------------
export const LeadTextInputSchema = z
  .object({
    text: z
      .string({ error: 'Escreve ou dita a descrição do lead.' })
      .trim()
      .min(5, { error: 'Escreve um pouco mais (empresa, contacto, telefone…).' })
      .max(4000, { error: 'Máximo de 4000 caracteres.' }),
  })
  .meta({ id: 'LeadTextInput' });
export type LeadTextInput = z.output<typeof LeadTextInputSchema>;

export const LEAD_TEXT_SYSTEM_PROMPT = `Recebes um texto ditado ou colado sobre uma empresa que pode vir a ser cliente (Portugal, normalmente) e extrais os dados para a ficha de um lead.
Devolves: empresa, contacto (nome da pessoa), email, telefone (como foi dito, só dígitos e espaços, com indicativo se houver), site, cidade, morada e notas (o resto que for útil: o que precisam, o que ficou combinado, cargo — curto).
Usa null para o que não estiver no texto. Não inventes nada. Emails e sites ditados ("arroba", "ponto pt") passam a escrita normal.`;

// -----------------------------------------------------------------------------
// Contacto para guardar no telemóvel (vCard 3.0)
// -----------------------------------------------------------------------------
const vEscape = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function buildVCard(lead: {
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  number?: number;
}): string {
  const person = lead.contact_name?.trim();
  const [first, ...rest] = (person ?? '').split(/\s+/);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    // Com o nome da pessoa: "Ana Silva (Padaria Estrela)"; sem: o nome da empresa.
    `FN:${vEscape(person ? `${person} (${lead.company_name})` : lead.company_name)}`,
    person ? `N:${vEscape(rest.join(' '))};${vEscape(first ?? '')};;;` : `N:;;;;`,
    `ORG:${vEscape(lead.company_name)}`,
  ];
  if (lead.phone) lines.push(`TEL;TYPE=WORK,VOICE:${lead.phone.replace(/[^\d+]/g, '')}`);
  if (lead.email) lines.push(`EMAIL;TYPE=INTERNET:${lead.email}`);
  if (lead.website) lines.push(`URL:${/^https?:\/\//.test(lead.website) ? lead.website : `https://${lead.website}`}`);
  if (lead.address || lead.city) lines.push(`ADR;TYPE=WORK:;;${vEscape(lead.address ?? '')};${vEscape(lead.city ?? '')};;;Portugal`);
  if (lead.number) lines.push(`NOTE:${vEscape(`Lead #${lead.number} (VNDesign Leads)`)}`);
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

/** Nome do ficheiro .vcf (sem caracteres que os telemóveis recusam). */
export function vCardFileName(company: string): string {
  return `${company.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'contacto'}.vcf`;
}

// -----------------------------------------------------------------------------
// Avisos por email
// -----------------------------------------------------------------------------
export function buildNotificationsEmail(input: {
  name: string | null;
  items: readonly (Pick<Notification, 'kind' | 'text' | 'created_at'> & { actor: string | null; lead: { number: number; company_name: string; url: string } | null })[];
  appUrl: string;
}): { subject: string; text: string } {
  const n = input.items.length;
  const lines = [input.name ? `Olá ${input.name.split(' ')[0]},` : 'Olá,', '', n === 1 ? 'Tens 1 aviso na VNDesign Leads:' : `Tens ${n} avisos na VNDesign Leads:`, ''];
  for (const item of input.items) {
    const who = item.actor ?? 'Alguém';
    lines.push(`• ${item.kind === 'task_assigned' ? `${who} deu-te uma tarefa` : `${who} mencionou-te`}: “${item.text}”`);
    if (item.lead) lines.push(`  #${item.lead.number} ${item.lead.company_name} — ${item.lead.url}`);
  }
  lines.push('', `Ver na plataforma: ${input.appUrl}/tarefas`, '', 'Para receberes os avisos na hora, liga as notificações no telemóvel (Definições → Conta).');
  return { subject: n === 1 ? 'Tens 1 aviso na VNDesign Leads' : `Tens ${n} avisos na VNDesign Leads`, text: lines.join('\n') };
}

