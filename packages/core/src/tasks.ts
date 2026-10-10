/**
 * Tarefas por lead (lista com caixas, por ordem) e listas-modelo por serviço —
 * por exemplo, os passos de um projeto depois de o lead passar a cliente.
 */
import { z } from 'zod';
import { LEAD_STATUSES } from './enums';
import { SERVICE_KEYS } from './services';

// (Sem importar de ./schemas: o schema "Hoje" de lá usa os daqui.)
const nullableDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.iso.date({ error: 'Data inválida.' }).nullable())
  .nullable()
  .meta({ description: 'Data no formato AAAA-MM-DD', example: '2026-10-08' });

const taskTitle = z
  .string({ error: 'Escreve a tarefa.' })
  .trim()
  .min(1, { error: 'Escreve a tarefa.' })
  .max(300, { error: 'Máximo de 300 caracteres.' });

export const LeadTaskSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    title: z.string(),
    due_on: z.string().nullable().meta({ description: 'Prazo (AAAA-MM-DD)' }),
    done_at: z.string().nullable().meta({ description: 'Quando foi concluída (null = por fazer)' }),
    remind_at: z.string().nullable().optional().meta({ description: 'Lembrete (data e hora): envia uma notificação' }),
    reminded_at: z.string().nullable().optional().meta({ description: 'Quando o lembrete foi enviado' }),
    position: z.number().meta({ description: 'Ordem na lista (menor = mais acima)' }),
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
  })
  .meta({ id: 'LeadTaskCreate' });
export type LeadTaskCreate = z.output<typeof LeadTaskCreateSchema>;

export const LeadTaskUpdateSchema = z
  .object({
    title: taskTitle.optional(),
    due_on: nullableDate.optional(),
    remind_at: remindAt.optional(),
    done: z.boolean().optional().meta({ description: 'true = concluída' }),
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
  lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), status: z.enum(LEAD_STATUSES) }),
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
  .array(z.string().trim().max(300, { error: 'Cada tarefa tem no máximo 300 caracteres.' }))
  .max(100, { error: 'Máximo de 100 tarefas por lista.' })
  .transform((items) => items.filter(Boolean));

export const TaskTemplateSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    service: z.enum(SERVICE_KEYS).nullable(),
    items: z.array(z.string()),
    sort_order: z.int(),
  })
  .meta({ id: 'TaskTemplate' });
export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

export const TaskTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Indica o nome da lista.' }).max(120),
    service: z.enum(SERVICE_KEYS).nullish().transform((v) => v ?? null),
    items: templateItems.refine((items) => items.length > 0, { error: 'Escreve pelo menos uma tarefa.' }),
    sort_order: z.int().min(0).max(1000).optional(),
  })
  .meta({ id: 'TaskTemplateCreate' });
export type TaskTemplateCreate = z.output<typeof TaskTemplateCreateSchema>;

// Sem valores por omissão (.partial() continuaria a aplicá-los).
export const TaskTemplateUpdateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Indica o nome da lista.' }).max(120).optional(),
    service: z.enum(SERVICE_KEYS).nullable().optional(),
    items: templateItems.refine((items) => items.length > 0, { error: 'Escreve pelo menos uma tarefa.' }).optional(),
    sort_order: z.int().min(0).max(1000).optional(),
  })
  .meta({ id: 'TaskTemplateUpdate' });
export type TaskTemplateUpdate = z.output<typeof TaskTemplateUpdateSchema>;

export const ApplyTaskTemplateSchema = z
  .object({ template_id: z.uuid({ error: 'Lista inválida.' }) })
  .meta({ id: 'ApplyTaskTemplate' });

/** Listas sugeridas para um lead: as dos seus serviços, pela ordem do catálogo. */
export function suggestTaskTemplates<T extends Pick<TaskTemplate, 'service'>>(templates: readonly T[], services: readonly string[] = []): T[] {
  return SERVICE_KEYS.filter((k) => services.includes(k)).flatMap((k) => templates.filter((t) => t.service === k));
}

/** Tarefas pela ordem de apresentação: por fazer (pela posição) e concluídas (as mais recentes primeiro). */
export function splitTasks<T extends Pick<LeadTask, 'done_at' | 'position'>>(tasks: readonly T[]): { pending: T[]; done: T[] } {
  const pending = tasks.filter((t) => !t.done_at).sort((a, b) => a.position - b.position);
  const done = tasks.filter((t) => t.done_at).sort((a, b) => (b.done_at! > a.done_at! ? 1 : b.done_at! < a.done_at! ? -1 : 0));
  return { pending, done };
}
