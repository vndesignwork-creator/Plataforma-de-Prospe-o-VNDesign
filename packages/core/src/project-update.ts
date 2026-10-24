/**
 * "Ponto de situação" para o cliente: um email curto com o que foi feito desde o
 * último (tarefas concluídas, entregas), os próximos passos, a próxima reunião,
 * o próximo pagamento e o link da página de acompanhamento (que é o relatório
 * sempre atualizado).
 */
import { formatCurrency, formatDate } from './format';

export const PROJECT_UPDATE_TEMPLATE = 'Ponto de situação';

export interface ProjectUpdateInput {
  company: string;
  projectTitle: string | null;
  contact: string | null;
  /** Data do último ponto de situação (AAAA-MM-DD); null = desde o início. */
  since: string | null;
  tasks: readonly { title: string; done_at: string | null; due_on: string | null }[];
  deliverables: readonly { title: string; status: string; sent_at?: string | null; approved_at?: string | null }[];
  meeting: { starts_at: string } | null;
  nextPayment: { description: string; amount: number; due_on: string | null } | null;
  shareUrl: string | null;
  signature: string | null;
}

const timeFmt = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });
const lisbonDay = (iso: string) => dayFmt.format(new Date(iso));

export function buildProjectUpdate(input: ProjectUpdateInput): { subject: string; body: string } {
  const after = (iso: string | null | undefined) => !!iso && (!input.since || lisbonDay(iso) >= input.since);
  const done = input.tasks.filter((t) => after(t.done_at));
  const open = input.tasks.filter((t) => !t.done_at).slice(0, 4);
  const delivered = input.deliverables.filter((d) => (d.status === 'aprovada' ? after(d.approved_at) : d.status === 'enviada' && after(d.sent_at)));
  const name = input.projectTitle ? `${input.projectTitle} (${input.company})` : input.company;

  const lines: string[] = [input.contact ? `Olá ${input.contact.split(' ')[0]},` : 'Boa tarde,', ''];
  lines.push(`Aqui fica o ponto de situação do projeto ${name}${input.since ? ` desde ${formatDate(input.since)}` : ''}.`, '');
  if (done.length) {
    lines.push('Concluído:', ...done.map((t) => `• ${t.title}`), '');
  } else {
    lines.push(input.since ? 'Desde o último ponto de situação estivemos a trabalhar nos próximos passos abaixo.' : 'O projeto arrancou: estes são os primeiros passos.', '');
  }
  if (delivered.length) {
    lines.push('Entregas:', ...delivered.map((d) => `• ${d.title} — ${d.status === 'aprovada' ? 'aprovada' : 'enviada para aprovação'}`), '');
  }
  if (open.length) {
    lines.push('Próximos passos:', ...open.map((t) => `• ${t.title}${t.due_on ? ` (até ${formatDate(t.due_on)})` : ''}`), '');
  }
  if (input.meeting) {
    const d = new Date(input.meeting.starts_at);
    lines.push(`Próxima reunião: ${formatDate(lisbonDay(input.meeting.starts_at))} às ${timeFmt.format(d)}.`);
  }
  if (input.nextPayment) {
    const p = input.nextPayment;
    lines.push(`Próximo pagamento: ${p.description} — ${formatCurrency(p.amount, { decimals: false })}${p.due_on ? ` até ${formatDate(p.due_on)}` : ''}.`);
  }
  if (input.meeting || input.nextPayment) lines.push('');
  if (input.shareUrl) lines.push(`Pode acompanhar tudo (tarefas, entregas e pagamentos) aqui: ${input.shareUrl}`, '');
  lines.push('Qualquer dúvida, diga.', '', 'Cumprimentos,');
  if (input.signature) lines.push(input.signature);

  return { subject: `${PROJECT_UPDATE_TEMPLATE} — ${input.projectTitle ?? input.company}`, body: lines.join('\n').trim() };
}

// -----------------------------------------------------------------------------
// Boas-vindas ao novo cliente: o que já existe numa só mensagem (página do
// cliente, briefing online, plano de pagamentos, próxima reunião e primeiros
// passos). A pessoa revê antes de enviar.
// -----------------------------------------------------------------------------

export const WELCOME_TEMPLATE = 'Boas-vindas';

export interface WelcomeInput {
  company: string;
  projectTitle: string | null;
  contact: string | null;
  dueOn: string | null;
  tasks: readonly { title: string; done_at: string | null; due_on: string | null }[];
  payments: readonly { description: string; amount: number; due_on: string | null; paid_on: string | null }[];
  meeting: { starts_at: string } | null;
  shareUrl: string | null;
  /** Link do briefing online (só se ainda não foi respondido). */
  briefingUrl: string | null;
  signature: string | null;
}

export function buildWelcomeEmail(input: WelcomeInput): { subject: string; body: string } {
  const name = input.projectTitle ? `${input.projectTitle} (${input.company})` : input.company;
  const steps = input.tasks.filter((t) => !t.done_at).slice(0, 4);
  const lines: string[] = [input.contact ? `Olá ${input.contact.split(' ')[0]},` : 'Boa tarde,', ''];
  lines.push(`Obrigado pela confiança! Fico muito contente por começarmos o projeto ${name}.`, '');
  lines.push('Para arrancar:');
  if (input.briefingUrl) lines.push(`• Responda ao briefing (10 minutos, pode juntar logótipos e fotografias): ${input.briefingUrl}`);
  if (input.meeting) {
    const d = new Date(input.meeting.starts_at);
    lines.push(`• A nossa reunião de arranque: ${formatDate(lisbonDay(input.meeting.starts_at))} às ${timeFmt.format(d)}.`);
  }
  for (const t of steps) lines.push(`• ${t.title}${t.due_on ? ` (até ${formatDate(t.due_on)})` : ''}`);
  if (!input.briefingUrl && !input.meeting && !steps.length) lines.push('• Envie-me os conteúdos que já tiver (textos, logótipos, fotografias).');
  lines.push('');
  if (input.dueOn) lines.push(`Entrega prevista: ${formatDate(input.dueOn)}.`, '');
  const open = input.payments.filter((p) => !p.paid_on);
  if (open.length) {
    lines.push('Pagamentos:', ...open.map((p) => `• ${p.description} — ${formatCurrency(p.amount, { decimals: false })}${p.due_on ? ` até ${formatDate(p.due_on)}` : ''}`), '');
  }
  if (input.shareUrl) lines.push(`Pode acompanhar o projeto (fases, tarefas, entregas e pagamentos) nesta página: ${input.shareUrl}`, '');
  lines.push('Qualquer dúvida, diga.', '', 'Cumprimentos,');
  if (input.signature) lines.push(input.signature);
  return { subject: `${WELCOME_TEMPLATE} — ${input.projectTitle ?? input.company}`, body: lines.join('\n').trim() };
}
