/**
 * Notas de reunião ou chamada com IA: a pessoa cola (ou dita) os apontamentos e
 * a IA devolve um resumo para a linha do tempo, as tarefas que saíram da
 * conversa e o próximo passo. Nada é gravado sem a pessoa rever.
 */
import { z } from 'zod';
import { addDays } from './format';

export const MeetingNotesInputSchema = z
  .object({
    notes: z
      .string({ error: 'Escreve os apontamentos.' })
      .trim()
      .min(20, { error: 'Escreve um pouco mais (pelo menos 20 caracteres).' })
      .max(20_000, { error: 'Máximo de 20 000 caracteres.' }),
  })
  .meta({ id: 'MeetingNotesInput' });

/** O que a IA devolve (sem limites no esquema: a saída estruturada não aceita todos). */
export const MeetingNotesDraftSchema = z.object({
  resumo: z.string(),
  tarefas: z.array(z.object({ titulo: z.string(), prazo_dias: z.number().nullable() })),
  proximo_passo: z.object({ texto: z.string(), dias: z.number().nullable() }).nullable(),
});
export type MeetingNotesDraft = z.infer<typeof MeetingNotesDraftSchema>;

export const MeetingNotesResultSchema = z
  .object({
    summary: z.string(),
    tasks: z.array(z.object({ title: z.string(), due_on: z.string().nullable() })),
    next_action: z.object({ text: z.string(), on: z.string().nullable() }).nullable(),
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
Não inventes nomes, valores nem datas que não estejam nos apontamentos.`;

export function buildMeetingNotesPrompt(input: { company: string; contact: string | null; today: string; notes: string }): string {
  return [`Hoje: ${input.today}`, `Empresa: ${input.company}`, input.contact ? `Contacto: ${input.contact}` : null, '', '<apontamentos>', input.notes, '</apontamentos>']
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
  return { summary: draft.resumo.trim(), tasks, next_action: next, model };
}
