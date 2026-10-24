/**
 * Resumo do lead com IA antes de ligar: lê a ficha (linha do tempo, notas,
 * tarefas, propostas) e diz em poucas frases quem é, o que já se falou, o que
 * ficou combinado e qual é o próximo passo. Não grava nada.
 */
import { z } from 'zod';

/** O que a IA devolve. */
export const LeadSummaryDraftSchema = z.object({
  resumo: z.string(),
  combinado: z.string().nullable(),
  proximo_passo: z.string().nullable(),
  atencao: z.string().nullable(),
});
export type LeadSummaryDraft = z.infer<typeof LeadSummaryDraftSchema>;

export const LeadSummarySchema = z
  .object({
    summary: z.string(),
    agreed: z.string().nullable(),
    next_step: z.string().nullable(),
    watch_out: z.string().nullable(),
    model: z.string(),
  })
  .meta({ id: 'LeadSummary' });
export type LeadSummary = z.infer<typeof LeadSummarySchema>;

export const LEAD_SUMMARY_SYSTEM_PROMPT = `Ajudas um web designer freelancer em Portugal a preparar-se antes de contactar um lead ou cliente: fazes o resumo do lead a partir da ficha.
Escreves em português de Portugal, frases curtas, sem floreados.
Devolves:
- resumo: 2 a 4 frases — quem é o negócio, em que ponto está a conversa, o último contacto (quando e como).
- combinado: o que ficou combinado ou prometido (por qualquer das partes); null se nada.
- proximo_passo: o próximo passo mais lógico agora (uma frase começada por um verbo); null se não houver.
- atencao: um cuidado a ter (objeção, preferência, horário, quem decide); null se não houver.
Usa só o que está na ficha; não inventes nomes, valores nem datas.`;

const line = (label: string, value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? null : `${label}: ${value}`);

export function buildLeadSummaryPrompt(input: {
  today: string;
  lead: {
    company_name: string;
    status: string;
    contact_name: string | null;
    city: string | null;
    website: string | null;
    services: string[];
    notes: string | null;
    pinned_note: string | null;
    problems: string | null;
    next_action_text: string | null;
    next_action_on: string | null;
    estimated_value: number | null;
  };
  activities: { date: string; type: string; text: string }[];
  tasks: { title: string; due_on: string | null; done: boolean }[];
  proposals: { status: string; total: number | null; date: string }[];
  meetings: { starts_at: string; canceled: boolean }[];
}): string {
  const l = input.lead;
  const parts = [
    `Hoje: ${input.today}`,
    line('Empresa', l.company_name),
    line('Estado', l.status),
    line('Contacto', l.contact_name),
    line('Cidade', l.city),
    line('Site', l.website),
    l.services.length ? `Serviços de interesse: ${l.services.join(', ')}` : null,
    line('Valor estimado (€)', l.estimated_value),
    line('Próxima ação marcada', l.next_action_text ? `${l.next_action_text}${l.next_action_on ? ` (${l.next_action_on})` : ''}` : null),
    line('Nota afixada', l.pinned_note),
    line('Problemas do site', l.problems?.slice(0, 800)),
    l.notes ? `<notas>\n${l.notes.slice(0, 3000)}\n</notas>` : null,
    input.activities.length
      ? `<linha_do_tempo mais_recente_primeiro>\n${input.activities.map((a) => `${a.date} · ${a.type}${a.text ? ` · ${a.text}` : ''}`).join('\n')}\n</linha_do_tempo>`
      : null,
    input.tasks.length ? `<tarefas>\n${input.tasks.map((t) => `${t.done ? '[feita]' : '[por fazer]'} ${t.title}${t.due_on ? ` (até ${t.due_on})` : ''}`).join('\n')}\n</tarefas>` : null,
    input.proposals.length ? `Propostas: ${input.proposals.map((p) => `${p.date} ${p.status}${p.total !== null ? ` ${p.total} €` : ''}`).join('; ')}` : null,
    input.meetings.length ? `Reuniões: ${input.meetings.map((m) => `${m.starts_at}${m.canceled ? ' (cancelada)' : ''}`).join('; ')}` : null,
  ];
  return parts.filter((p) => p !== null).join('\n');
}

export function leadSummaryResult(draft: LeadSummaryDraft, model: string): LeadSummary {
  const clean = (v: string | null) => (v && v.trim() ? v.trim().slice(0, 600) : null);
  return { summary: draft.resumo.trim().slice(0, 1200), agreed: clean(draft.combinado), next_step: clean(draft.proximo_passo), watch_out: clean(draft.atencao), model };
}
