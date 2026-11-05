/**
 * Notas de reunião ou chamada com IA: a pessoa cola (ou dita) os apontamentos e
 * a IA devolve um resumo para a linha do tempo, as tarefas que saíram da
 * conversa e o próximo passo. Nada é gravado sem a pessoa rever.
 */
import { z } from 'zod';
import { LEAD_STATUSES, type LeadStatus } from './enums';
import { addDays } from './format';

/** De onde vem o texto: apontamentos, uma conversa colada (WhatsApp/email) ou uma gravação transcrita. */
export const MEETING_NOTES_SOURCES = ['notes', 'conversation', 'recording'] as const;
export type MeetingNotesSource = (typeof MEETING_NOTES_SOURCES)[number];
export const MEETING_NOTES_SOURCE_LABELS: Record<MeetingNotesSource, string> = {
  notes: 'Apontamentos',
  conversation: 'Conversa colada',
  recording: 'Gravação',
};
/** Título da nota na linha do tempo. */
export const MEETING_NOTES_NOTE_TITLE: Record<MeetingNotesSource, string> = {
  notes: '📝 Resumo da reunião/chamada',
  conversation: '💬 Resumo da conversa',
  recording: '🎙️ Resumo da reunião (gravação)',
};

export const MeetingNotesInputSchema = z
  .object({
    notes: z
      .string({ error: 'Escreve os apontamentos.' })
      .trim()
      .min(20, { error: 'Escreve um pouco mais (pelo menos 20 caracteres).' })
      .max(60_000, { error: 'Máximo de 60 000 caracteres.' }),
    source: z.enum(MEETING_NOTES_SOURCES).default('notes').meta({ description: 'notes = apontamentos; conversation = conversa colada; recording = gravação transcrita' }),
  })
  .meta({ id: 'MeetingNotesInput' });

/** O que a IA devolve (sem limites no esquema: a saída estruturada não aceita todos). */
export const MeetingNotesDraftSchema = z.object({
  resumo: z.string(),
  tarefas: z.array(z.object({ titulo: z.string(), prazo_dias: z.number().nullable() })),
  proximo_passo: z.object({ texto: z.string(), dias: z.number().nullable() }).nullable(),
  fase: z.string().nullable(),
});
export type MeetingNotesDraft = z.infer<typeof MeetingNotesDraftSchema>;

export const MeetingNotesResultSchema = z
  .object({
    summary: z.string(),
    tasks: z.array(z.object({ title: z.string(), due_on: z.string().nullable() })),
    next_action: z.object({ text: z.string(), on: z.string().nullable() }).nullable(),
    status: z.enum(LEAD_STATUSES).nullable().optional().meta({ description: 'Fase que a conversa mostra (null = não se sabe)' }),
    model: z.string(),
  })
  .meta({ id: 'MeetingNotesResult' });
export type MeetingNotesResult = z.infer<typeof MeetingNotesResultSchema>;

export const MEETING_NOTES_SYSTEM_PROMPT = `Ajudas um web designer freelancer em Portugal a organizar os apontamentos de uma reunião ou chamada com um cliente ou potencial cliente.
Escreves em português de Portugal.
Devolves:
- resumo: 2 a 5 frases curtas com o que foi falado e decidido (necessidades, orçamento, prazos, objeções). Factual, sem inventar.
- tarefas: as ações concretas para o web designer fazer (no máximo 6), cada uma começada por um verbo ("Enviar proposta da loja online"). prazo_dias = em quantos dias, se os apontamentos disserem ou for óbvio (ex.: "até sexta" a partir de hoje); senão null.
- proximo_passo: o próximo contacto com o cliente (ex.: "Ligar para saber a decisão"), com dias = em quantos dias; null se não houver.
- fase: só se o texto o mostrar claramente, a fase em que o cliente está: "respondeu" (respondeu/mostrou interesse), "reuniao" (marcaram reunião), "proposta_enviada" (já recebeu proposta), "cliente" (aceitou/adjudicou), "sem_interesse" (recusou) ou "em_pausa" (pediu para falar mais tarde); senão null.
Não inventes nomes, valores nem datas que não estejam no texto.`;

const SOURCE_INTRO: Record<MeetingNotesSource, string> = {
  notes: 'Apontamentos da reunião ou chamada (escritos pelo web designer).',
  conversation:
    'Conversa colada (WhatsApp, Messenger ou email) entre o web designer e o cliente. Ignora horas, "mensagem apagada", reações e assinaturas; o resumo é do ponto de vista do web designer.',
  recording: 'Transcrição automática da gravação de uma reunião (pode ter erros de reconhecimento: interpreta pelo contexto).',
};

export function buildMeetingNotesPrompt(input: { company: string; contact: string | null; today: string; notes: string; source?: MeetingNotesSource }): string {
  const source = input.source ?? 'notes';
  return [`Hoje: ${input.today}`, `Empresa: ${input.company}`, input.contact ? `Contacto: ${input.contact}` : null, SOURCE_INTRO[source], '', '<texto>', input.notes, '</texto>']
    .filter((l) => l !== null)
    .join('\n');
}

/** Converte a resposta da IA: datas a partir de hoje, títulos limpos, no máximo 6 tarefas. */
export function meetingNotesResult(draft: MeetingNotesDraft, today: string, model: string): MeetingNotesResult {
  const due = (days: number | null) => (days === null || !Number.isFinite(days) || days < 0 || days > 365 ? null : addDays(today, Math.round(days)));
  const tasks = draft.tarefas
    .map((t) => ({ title: t.titulo.trim().slice(0, 300), due_on: due(t.prazo_dias) }))
    .filter((t) => t.title)
    .slice(0, 6);
  const next = draft.proximo_passo && draft.proximo_passo.texto.trim() ? { text: draft.proximo_passo.texto.trim().slice(0, 300), on: due(draft.proximo_passo.dias) } : null;
  const status = draft.fase && (LEAD_STATUSES as readonly string[]).includes(draft.fase.trim()) ? (draft.fase.trim() as LeadStatus) : null;
  return { summary: draft.resumo.trim(), tasks, next_action: next, status, model };
}
