/**
 * Tarefas por lead (lista com caixas, por ordem) e listas-modelo por serviço —
 * por exemplo, os passos de um projeto depois de o lead passar a cliente.
 */
import { z } from 'zod';
import { ServiceKeySchema } from './services';
import { LEAD_STATUSES } from './enums';

// (Sem importar de ./schemas: o schema "Hoje" de lá usa os daqui.)
const nullableDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.iso.date({ error: 'Data inválida.' }).nullable())
  .nullable()
  .meta({ description: 'Data no formato AAAA-MM-DD', example: '2026-10-08' });

/** Texto máximo de uma tarefa (era 300). */
export const TASK_TITLE_MAX = 2000;

/** Repetir: ao concluir, cria-se a seguinte com a data seguinte. */
export const TASK_REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const;
export type TaskRepeat = (typeof TASK_REPEATS)[number];
export const TASK_REPEAT_LABELS: Record<TaskRepeat, string> = {
  daily: 'Todos os dias',
  weekdays: 'Dias úteis (seg. a sex.)',
  weekly: 'Todas as semanas',
  monthly: 'Todos os meses',
  yearly: 'Todos os anos',
};
/** Curto, ao lado da tarefa ("🔁 Semanal"). */
export const TASK_REPEAT_SHORT: Record<TaskRepeat, string> = {
  daily: 'Diária',
  weekdays: 'Dias úteis',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};
const repeatField = z.enum(TASK_REPEATS, { error: 'Repetição inválida.' }).nullable();

/** Um passo da repetição a partir de `iso` (o fim do mês fica no último dia: 31/01 → 28/02). */
function stepRepeat(iso: string, repeat: TaskRepeat, anchorDay: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (repeat === 'weekdays') {
    do d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  } else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else {
    const months = repeat === 'monthly' ? 1 : 12;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(anchorDay, last), 12)).toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Data da próxima vez: a seguir ao prazo (ou a hoje, sem prazo), sempre depois de hoje
 * (concluir atrasada salta as vezes que já passaram). Mensal no dia 31 → último dia do mês.
 */
export function nextRepeatDate(due: string | null, repeat: TaskRepeat, today: string): string {
  const base = due ?? today;
  const anchor = Number(base.slice(8, 10));
  let next = stepRepeat(base, repeat, anchor);
  for (let i = 0; next <= today && i < 3700; i++) next = stepRepeat(next, repeat, anchor);
  return next;
}

const taskTitle = z
  .string({ error: 'Escreve a tarefa.' })
  .trim()
  .min(1, { error: 'Escreve a tarefa.' })
  .max(TASK_TITLE_MAX, { error: `Máximo de ${TASK_TITLE_MAX} caracteres.` });

export const LeadTaskSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid().nullable().meta({ description: 'Lead ou projeto (null = tarefa solta, sem lead)' }),
    list_id: z.uuid().nullable().optional().meta({ description: 'Lista (cartão) das tarefas soltas; null = sem lista' }),
    title: z.string(),
    due_on: z.string().nullable().meta({ description: 'Prazo (AAAA-MM-DD)' }),
    done_at: z.string().nullable().meta({ description: 'Quando foi concluída (null = por fazer)' }),
    remind_at: z.string().nullable().optional().meta({ description: 'Lembrete (data e hora): envia uma notificação' }),
    reminded_at: z.string().nullable().optional().meta({ description: 'Quando o lembrete foi enviado' }),
    position: z.number().meta({ description: 'Ordem na lista (menor = mais acima)' }),
    assigned_to: z.uuid().nullable().optional().meta({ description: 'Responsável (membro da equipa; null = ninguém)' }),
    time_seconds: z.int().optional().meta({ description: 'Tempo registado nesta tarefa (Pomodoro ou registos à mão)' }),
    repeat: repeatField.optional().meta({ description: 'Repetir (ao concluir, cria-se a seguinte); null = não se repete' }),
    done_by: z.uuid().nullable().optional().meta({ description: 'Quem a marcou como feita' }),
    next_task_id: z.uuid().nullable().optional().meta({ description: 'A próxima vez (tarefa que se repete, já criada)' }),
    created_by: z.uuid().nullable().optional().meta({ description: 'Quem a criou' }),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'LeadTask' });
export type LeadTask = z.infer<typeof LeadTaskSchema>;

const remindAt = z.iso
  .datetime({ offset: true, error: 'Data e hora do lembrete inválidas.' })
  .nullable()
  .meta({ description: 'Data e hora do lembrete (ISO 8601, ex.: 2026-10-15T10:00:00+01:00)' });

export const LeadTaskCreateSchema = z
  .object({
    title: taskTitle,
    due_on: nullableDate.optional().transform((v) => v ?? null),
    remind_at: remindAt.optional().transform((v) => v ?? null),
    assigned_to: z.uuid({ error: 'Responsável inválido.' }).nullable().optional().meta({ description: 'Responsável (recebe um aviso)' }),
    repeat: repeatField.optional().meta({ description: 'Repetir (ao concluir, cria-se a seguinte)' }),
  })
  .meta({ id: 'LeadTaskCreate' });
export type LeadTaskCreate = z.output<typeof LeadTaskCreateSchema>;

/** Nova tarefa na página Tarefas: num lead/projeto (lead_id) ou solta (sem lead_id). */
export const TaskCreateSchema = LeadTaskCreateSchema.extend({
  lead_id: z.uuid({ error: 'Lead inválido.' }).nullable().optional().meta({ description: 'Lead ou projeto (vazio = tarefa solta)' }),
  list_id: z.uuid({ error: 'Lista inválida.' }).nullable().optional().meta({ description: 'Lista (cartão) para uma tarefa solta' }),
}).meta({ id: 'TaskCreate' });
export type TaskCreate = z.output<typeof TaskCreateSchema>;

export const LeadTaskUpdateSchema = z
  .object({
    title: taskTitle.optional(),
    due_on: nullableDate.optional(),
    remind_at: remindAt.optional(),
    done: z.boolean().optional().meta({ description: 'true = concluída' }),
    assigned_to: z.uuid({ error: 'Responsável inválido.' }).nullable().optional().meta({ description: 'Responsável (null = ninguém); recebe um aviso' }),
    lead_id: z.uuid({ error: 'Lead inválido.' }).nullable().optional().meta({ description: 'Mover para outro lead/projeto (null = tarefa solta)' }),
    list_id: z.uuid({ error: 'Lista inválida.' }).nullable().optional().meta({ description: 'Mover para uma lista (tira a tarefa do lead)' }),
    repeat: repeatField.optional().meta({ description: 'Repetir (null = deixa de se repetir)' }),
  })
  .meta({ id: 'LeadTaskUpdate' });
export type LeadTaskUpdate = z.output<typeof LeadTaskUpdateSchema>;

export const LeadTaskReorderSchema = z
  .object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, { error: 'Tarefas repetidas.' })
      .meta({ description: 'Ids das tarefas pela nova ordem' }),
  })
  .meta({ id: 'LeadTaskReorder' });

export const TaskProgressSchema = z
  .object({ total: z.int(), done: z.int() })
  .meta({ id: 'TaskProgress', description: 'Tarefas do lead: total e concluídas' });
export type TaskProgress = z.infer<typeof TaskProgressSchema>;

/** Tarefa com prazo para "Hoje" (com o lead a que pertence). */
export const TodayTaskSchema = LeadTaskSchema.extend({
  lead: z
    .object({ id: z.uuid(), number: z.int(), company_name: z.string(), status: z.enum(LEAD_STATUSES) })
    .nullable()
    .meta({ description: 'null = tarefa solta (sem lead)' }),
}).meta({ id: 'TodayTask' });
export type TodayTask = z.infer<typeof TodayTaskSchema>;

export const TodayTasksSchema = z
  .object({
    overdue: z.array(TodayTaskSchema),
    due_today: z.array(TodayTaskSchema),
    upcoming: z.array(TodayTaskSchema).meta({ description: 'Próximos 7 dias' }),
  })
  .meta({ id: 'TodayTasks' });
export type TodayTasks = z.infer<typeof TodayTasksSchema>;

// -----------------------------------------------------------------------------
// Listas-modelo
// -----------------------------------------------------------------------------
const templateItems = z
  .array(z.string().trim().max(TASK_TITLE_MAX, { error: `Cada tarefa tem no máximo ${TASK_TITLE_MAX} caracteres.` }))
  .max(100, { error: 'Máximo de 100 tarefas por lista.' })
  .transform((items) => items.filter(Boolean));

export const TaskTemplateSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    service: z.string().nullable(),
    items: z.array(z.string()),
    sort_order: z.int(),
  })
  .meta({ id: 'TaskTemplate' });
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

export const TaskTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Indica o nome da lista.' }).max(120),
    service: ServiceKeySchema.nullish().transform((v) => v ?? null),
    items: templateItems.refine((items) => items.length > 0, { error: 'Escreve pelo menos uma tarefa.' }),
    sort_order: z.int().min(0).max(1000).optional(),
  })
  .meta({ id: 'TaskTemplateCreate' });
export type TaskTemplateCreate = z.output<typeof TaskTemplateCreateSchema>;

// Sem valores por omissão (.partial() continuaria a aplicá-los).
export const TaskTemplateUpdateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Indica o nome da lista.' }).max(120).optional(),
    service: ServiceKeySchema.nullable().optional(),
    items: templateItems.refine((items) => items.length > 0, { error: 'Escreve pelo menos uma tarefa.' }).optional(),
    sort_order: z.int().min(0).max(1000).optional(),
  })
  .meta({ id: 'TaskTemplateUpdate' });
export type TaskTemplateUpdate = z.output<typeof TaskTemplateUpdateSchema>;

export const ApplyTaskTemplateSchema = z
  .object({ template_id: z.uuid({ error: 'Lista inválida.' }) })
  .meta({ id: 'ApplyTaskTemplate' });

/** Listas sugeridas para um lead: as dos seus serviços, pela ordem dos serviços do lead. */
export function suggestTaskTemplates<T extends Pick<TaskTemplate, 'service'>>(templates: readonly T[], services: readonly string[] = []): T[] {
  return [...new Set(services)].flatMap((k) => templates.filter((t) => t.service === k));
}

/** Tarefas pela ordem de apresentação: por fazer (pela posição) e concluídas (as mais recentes primeiro). */
export function splitTasks<T extends Pick<LeadTask, 'done_at' | 'position'>>(tasks: readonly T[]): { pending: T[]; done: T[] } {
  const pending = tasks.filter((t) => !t.done_at).sort((a, b) => a.position - b.position);
  const done = tasks.filter((t) => t.done_at).sort((a, b) => (b.done_at! > a.done_at! ? 1 : b.done_at! < a.done_at! ? -1 : 0));
  return { pending, done };
}

// -----------------------------------------------------------------------------
// Pesquisa rápida (Ctrl+K): tarefas de todos os leads
// -----------------------------------------------------------------------------
export const TaskSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2, { error: 'Escreve pelo menos 2 letras.' }).max(100).meta({ description: 'Texto a procurar no título das tarefas' }),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  })
  .meta({ id: 'TaskSearchQuery' });
export type TaskSearchQuery = z.output<typeof TaskSearchQuerySchema>;

export const TaskSearchResultSchema = LeadTaskSchema.extend({
  lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), project_title: z.string().nullable() }),
}).meta({ id: 'TaskSearchResult' });
export type TaskSearchResult = z.infer<typeof TaskSearchResultSchema>;

// -----------------------------------------------------------------------------
// Listas (cartões com título, como no Google Keep)
// -----------------------------------------------------------------------------
export const TaskListSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    position: z.number(),
    shared: z.boolean().optional().meta({ description: 'Partilhada: toda a equipa vê e mexe (senão, só quem a criou)' }),
    archived_at: z.string().nullable().optional().meta({ description: 'Arquivada (sai do quadro; as tarefas também)' }),
    created_by: z.uuid().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .meta({ id: 'TaskList' });
export type TaskList = z.infer<typeof TaskListSchema>;

const listTitle = z.string().trim().min(1, { error: 'Dá um título à lista.' }).max(120, { error: 'Máximo de 120 caracteres.' });
export const TaskListCreateSchema = z
  .object({
    title: listTitle,
    items: z
      .array(z.string().trim().max(TASK_TITLE_MAX))
      .max(100)
      .optional()
      .transform((items) => (items ?? []).filter(Boolean))
      .meta({ description: 'Tarefas para criar já na lista (pela ordem)' }),
    assigned_to: z.uuid().nullable().optional().meta({ description: 'Responsável das tarefas criadas já' }),
    shared: z.boolean().optional().meta({ description: 'Partilhada com a equipa' }),
  })
  .meta({ id: 'TaskListCreate' });
export const TaskListUpdateSchema = z
  .object({
    title: listTitle.optional(),
    position: z.number().optional(),
    shared: z.boolean().optional().meta({ description: 'Partilhar com a equipa (só quem a criou, o dono ou um administrador)' }),
    archived: z.boolean().optional().meta({ description: 'true = arquivar; false = desarquivar' }),
  })
  .meta({ id: 'TaskListUpdate' });
export type TaskListUpdate = z.infer<typeof TaskListUpdateSchema>;

export const TaskListsQuerySchema = z.object({
  archived: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1')
    .meta({ description: '1 = as arquivadas (com as tarefas delas)' }),
});
export const TaskListWithTasksSchema = TaskListSchema.extend({ tasks: z.array(LeadTaskSchema) }).meta({ id: 'TaskListWithTasks' });
export type TaskListWithTasks = z.infer<typeof TaskListWithTasksSchema>;

/** Nova ordem de tarefas (de um mesmo cartão: lead, lista ou soltas). */
export const TaskReorderSchema = LeadTaskReorderSchema.meta({ id: 'TaskReorder' });
