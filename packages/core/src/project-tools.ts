/**
 * Ferramentas dos projetos (clientes): prazo de entrega, fases, rondas de
 * revisão, registo de horas, ficheiros/entregas, página para o cliente,
 * calendário e a lista da página Projetos.
 */
import { z } from 'zod';
import { addDays, daysBetween } from './format';
import { LeadSchema, nullableDate, nullableUrl } from './schemas';
import { PaymentSummarySchema } from './projects';

// -----------------------------------------------------------------------------
// Fases e prazo
// -----------------------------------------------------------------------------

export const PROJECT_STAGES = ['briefing', 'producao', 'revisoes', 'entrega'] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  briefing: 'Briefing',
  producao: 'Em produção',
  revisoes: 'Revisões',
  entrega: 'Entrega',
};

/** Texto da fase para o cliente (página de acompanhamento). */
export const PROJECT_STAGE_CLIENT_TEXT: Record<ProjectStage, string> = {
  briefing: 'A recolher a informação e a preparar o projeto.',
  producao: 'O trabalho está a ser feito.',
  revisoes: 'A afinar os detalhes com as suas revisões.',
  entrega: 'Na reta final: preparação dos ficheiros e entrega.',
};

export const ProjectInfoSchema = z
  .object({
    due_on: z.string().nullable().meta({ description: 'Prazo de entrega (AAAA-MM-DD)' }),
    stage: z.enum(PROJECT_STAGES),
    revisions_included: z.int().meta({ description: 'Rondas de revisão incluídas no preço' }),
    share_token: z.string().nullable().meta({ description: 'Código do link do cliente (/p/<código>); null = desligado' }),
  })
  .meta({ id: 'ProjectInfo' });
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;
export const DEFAULT_PROJECT_INFO: ProjectInfo = { due_on: null, stage: 'briefing', revisions_included: 2, share_token: null };

export const ProjectInfoUpdateSchema = z
  .object({
    due_on: nullableDate,
    stage: z.enum(PROJECT_STAGES, { error: 'Fase inválida.' }),
    revisions_included: z.int({ error: 'Indica um número.' }).min(0, { error: 'Mínimo 0.' }).max(50, { error: 'Máximo 50.' }),
  })
  .partial()
  .meta({ id: 'ProjectInfoUpdate' });
export type ProjectInfoUpdate = z.output<typeof ProjectInfoUpdateSchema>;

export const ProjectShareSchema = z
  .object({
    enabled: z.boolean().meta({ description: 'Ligar ou desligar o link do cliente' }),
    regenerate: z.boolean().default(false).meta({ description: 'Gerar um link novo (o antigo deixa de funcionar)' }),
  })
  .meta({ id: 'ProjectShare' });

/** "Faltam 5 dias", "Entrega hoje", "Atrasado 2 dias" — e a cor. */
export function dueStatus(dueOn: string | null | undefined, today: string): { days: number; label: string; tone: 'danger' | 'warning' | 'muted' } | null {
  if (!dueOn) return null;
  const days = daysBetween(today, dueOn);
  const n = (v: number) => `${v} dia${v === 1 ? '' : 's'}`;
  if (days < 0) return { days, label: `Atrasado ${n(-days)}`, tone: 'danger' };
  if (days === 0) return { days, label: 'Entrega hoje', tone: 'warning' };
  if (days === 1) return { days, label: 'Entrega amanhã', tone: 'warning' };
  return { days, label: `Faltam ${n(days)}`, tone: days <= 3 ? 'warning' : 'muted' };
}

// -----------------------------------------------------------------------------
// Rondas de revisão
// -----------------------------------------------------------------------------

export const ProjectRevisionSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    description: z.string(),
    billable: z.boolean().meta({ description: 'Além das incluídas: a cobrar à parte' }),
    requested_on: z.string(),
    created_at: z.string(),
  })
  .meta({ id: 'ProjectRevision' });
export type ProjectRevision = z.infer<typeof ProjectRevisionSchema>;

export const ProjectRevisionCreateSchema = z
  .object({
    description: z.string({ error: 'Descreve o que o cliente pediu.' }).trim().min(1, { error: 'Descreve o que o cliente pediu.' }).max(500),
    requested_on: nullableDate.optional().transform((v) => v ?? null),
    /** Sem valor: a cobrar à parte quando já passou das incluídas. */
    billable: z.boolean().optional(),
  })
  .meta({ id: 'ProjectRevisionCreate' });
export type ProjectRevisionCreate = z.output<typeof ProjectRevisionCreateSchema>;

// -----------------------------------------------------------------------------
// Registo de horas
// -----------------------------------------------------------------------------

export const TimeEntrySchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    user_id: z.uuid(),
    started_at: z.string(),
    ended_at: z.string().nullable().meta({ description: 'null = o temporizador está a contar' }),
    minutes: z.int().meta({ description: 'Duração em minutos (a contar: até agora)' }),
    seconds: z.int().meta({ description: 'Duração em segundos (a contar: até agora)' }),
    notes: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: 'TimeEntry' });
export type TimeEntry = z.infer<typeof TimeEntrySchema>;

export const TimeEntryCreateSchema = z
  .object({
    date: z.iso.date({ error: 'Data inválida.' }),
    minutes: z
      .int({ error: 'Indica os minutos.' })
      .min(1, { error: 'Mínimo 1 minuto.' })
      .max(24 * 60, { error: 'Máximo 24 horas.' }),
    notes: z.string().trim().max(300).optional().transform((v) => v || null),
  })
  .meta({ id: 'TimeEntryCreate' });
export type TimeEntryCreate = z.output<typeof TimeEntryCreateSchema>;

export const TimeEntryUpdateSchema = z
  .object({
    date: z.iso.date({ error: 'Data inválida.' }),
    minutes: z
      .int({ error: 'Indica os minutos.' })
      .min(1, { error: 'Mínimo 1 minuto.' })
      .max(24 * 60, { error: 'Máximo 24 horas.' }),
    notes: z.string().trim().max(300).transform((v) => v || null),
  })
  .partial()
  .meta({ id: 'TimeEntryUpdate' });
export type TimeEntryUpdate = z.output<typeof TimeEntryUpdateSchema>;

export const TimeStartSchema = z
  .object({ notes: z.string().trim().max(300).optional().transform((v) => v || null) })
  .meta({ id: 'TimeStart' });

export const ProjectTimeSchema = z
  .object({
    entries: z.array(TimeEntrySchema),
    total_minutes: z.int(),
    logged_seconds: z.int().meta({ description: 'Tempo já registado, sem o que está a contar agora' }),
    /** O temporizador do utilizador neste projeto (null = parado). */
    running: TimeEntrySchema.nullable(),
    value: z.number().nullable().meta({ description: 'Valor do projeto (proposta aceite, pagamentos ou valor estimado)' }),
    hourly_rate: z.number().nullable().meta({ description: 'Valor ÷ horas (€/hora)' }),
  })
  .meta({ id: 'ProjectTime' });
export type ProjectTime = z.infer<typeof ProjectTimeSchema>;

export const RunningTimerSchema = z
  .object({
    entry: TimeEntrySchema,
    lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string() }),
    logged_seconds: z.int().meta({ description: 'Tempo já registado nesse projeto, sem o que está a contar' }),
  })
  .nullable()
  .meta({ id: 'RunningTimer' });
export type RunningTimer = z.infer<typeof RunningTimerSchema>;

/** Segundos de um registo (a contar: até `now`). */
export function entrySeconds(entry: { started_at: string; ended_at: string | null }, now: number = Date.now()): number {
  const end = entry.ended_at ? Date.parse(entry.ended_at) : now;
  return Math.max(0, Math.floor((end - Date.parse(entry.started_at)) / 1000));
}

/** Minutos de um registo (arredondado para baixo; a contar: até `now`). */
export function entryMinutes(entry: { started_at: string; ended_at: string | null }, now: number = Date.now()): number {
  return Math.floor(entrySeconds(entry, now) / 60);
}

/** 45 → "45 s"; 750 → "12 min"; 3900 → "1 h 05 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s < 60 ? `${s} s` : formatMinutes(Math.floor(s / 60));
}

/** 125 → "2 h 05 min"; 45 → "45 min"; 120 → "2 h". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')} min` : `${h} h`;
}

/** Segundos → "1:05:09" (temporizador a contar). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Valor ganho por hora (só com 15 minutos ou mais registados). */
export function hourlyRate(value: number | null | undefined, minutes: number): number | null {
  if (!value || value <= 0 || minutes < 15) return null;
  return Math.round((value / (minutes / 60)) * 100) / 100;
}

// -----------------------------------------------------------------------------
// Ficheiros e entregas
// -----------------------------------------------------------------------------

export const DELIVERABLE_STATUSES = ['rascunho', 'enviada', 'aprovada'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  rascunho: 'Por enviar',
  enviada: 'Enviada',
  aprovada: 'Aprovada pelo cliente',
};

export const ProjectDeliverableSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    title: z.string(),
    url: z.string().nullable().meta({ description: 'Link (Google Drive, Figma, Canva…)' }),
    status: z.enum(DELIVERABLE_STATUSES),
    sent_at: z.string().nullable(),
    approved_at: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: 'ProjectDeliverable' });
export type ProjectDeliverable = z.infer<typeof ProjectDeliverableSchema>;

const deliverableTitle = z.string({ error: 'Dá um nome à entrega.' }).trim().min(1, { error: 'Dá um nome à entrega.' }).max(200);

export const ProjectDeliverableCreateSchema = z
  .object({
    title: deliverableTitle,
    url: nullableUrl.optional().transform((v) => v ?? null),
    status: z.enum(DELIVERABLE_STATUSES).default('rascunho'),
  })
  .meta({ id: 'ProjectDeliverableCreate' });
export type ProjectDeliverableCreate = z.output<typeof ProjectDeliverableCreateSchema>;

export const ProjectDeliverableUpdateSchema = z
  .object({ title: deliverableTitle, url: nullableUrl, status: z.enum(DELIVERABLE_STATUSES) })
  .partial()
  .meta({ id: 'ProjectDeliverableUpdate' });
export type ProjectDeliverableUpdate = z.output<typeof ProjectDeliverableUpdateSchema>;

// -----------------------------------------------------------------------------
// Concluir o projeto (com os passos finais)
// -----------------------------------------------------------------------------

export const ProjectCompleteSchema = z
  .object({
    completed: z.boolean(),
    /** Ao concluir: criar a tarefa "Juntar ao portefólio". */
    portfolio_task: z.boolean().default(false),
    /** Ao concluir: lembrete para propor um novo serviço daqui a N meses. */
    upsell_months: z.int().min(1).max(24).nullable().default(null),
  })
  .meta({ id: 'ProjectComplete' });
export type ProjectComplete = z.output<typeof ProjectCompleteSchema>;

export const UPSELL_MONTHS = [3, 6, 12] as const;

/** AAAA-MM-DD daqui a N meses (fim do mês se o dia não existir). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Lista da página Projetos
// -----------------------------------------------------------------------------

export const ProjectSchema = z
  .object({
    lead: LeadSchema,
    info: ProjectInfoSchema,
    tasks: z.object({ total: z.int(), done: z.int() }),
    next_task: z.object({ id: z.uuid(), title: z.string(), due_on: z.string().nullable() }).nullable(),
    payments: PaymentSummarySchema,
    next_meeting: z.object({ id: z.uuid(), starts_at: z.string() }).nullable(),
    revisions: z.object({ used: z.int() }),
    time: z.object({
      minutes: z.int().meta({ description: 'Total em minutos (com o que está a contar)' }),
      logged_seconds: z.int().meta({ description: 'Já registado, sem o que está a contar' }),
      running_since: z.string().nullable().meta({ description: 'O meu temporizador neste projeto' }),
    }),
    deliverables: z.object({ total: z.int(), approved: z.int() }),
    value: z.number().nullable().meta({ description: 'Valor do projeto' }),
  })
  .meta({ id: 'Project' });
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsQuerySchema = z.object({
  state: z.enum(['active', 'completed']).default('active').meta({ description: 'Em curso ou concluídos' }),
});

// -----------------------------------------------------------------------------
// Calendário (prazos, reuniões, pagamentos e tarefas)
// -----------------------------------------------------------------------------

export const CALENDAR_EVENT_TYPES = ['due', 'meeting', 'payment', 'task'] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];
export const CALENDAR_EVENT_LABELS: Record<CalendarEventType, string> = {
  due: 'Entrega',
  meeting: 'Reunião',
  payment: 'Pagamento',
  task: 'Tarefa',
};

export const CalendarEventSchema = z
  .object({
    id: z.string(),
    date: z.string().meta({ description: 'AAAA-MM-DD (hora de Lisboa)' }),
    type: z.enum(CALENDAR_EVENT_TYPES),
    title: z.string(),
    starts_at: z.string().nullable().meta({ description: 'Reuniões: data e hora' }),
    amount: z.number().nullable(),
    done: z.boolean().meta({ description: 'Pago / tarefa feita' }),
    lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string() }),
  })
  .meta({ id: 'CalendarEvent' });
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const CalendarQuerySchema = z
  .object({
    from: z.iso.date({ error: 'Data inválida.' }),
    to: z.iso.date({ error: 'Data inválida.' }),
  })
  .refine((q) => q.from <= q.to && daysBetween(q.from, q.to) <= 62, { error: 'Intervalo inválido (máximo 62 dias).' });

/** Dias (AAAA-MM-DD) a mostrar na grelha de um mês: de segunda a domingo, semanas completas. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  const start = addDays(first, -weekday);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((weekday + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

// -----------------------------------------------------------------------------
// Página de acompanhamento para o cliente (/p/<código>)
// -----------------------------------------------------------------------------

export interface SharedProject {
  company_name: string;
  contact_name: string | null;
  stage: ProjectStage;
  due_on: string | null;
  completed_at: string | null;
  tasks: { title: string; done: boolean }[];
  next_meeting: { starts_at: string; location: string | null } | null;
  deliverables: { title: string; url: string | null; status: DeliverableStatus; date: string | null }[];
  payments: { total: number; paid: number; outstanding: number; next: { description: string; amount: number; due_on: string | null } | null } | null;
  revisions: { used: number; included: number } | null;
  from: { name: string; company: string | null; email: string | null; phone: string | null; website: string | null };
  updated_at: string;
}
