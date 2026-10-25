/**
 * Ferramentas dos projetos (clientes): prazo de entrega, fases, rondas de
 * revisão, registo de horas, ficheiros/entregas, página para o cliente,
 * calendário e a lista da página Projetos.
 */
import { z } from 'zod';
import { addDays, daysBetween } from './format';
import { LeadSchema, nullableDate, nullableUrl } from './schemas';
import { PaymentSummarySchema, icsDate, icsFold, icsText } from './projects';

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

export const ProjectStartResultSchema = z
  .object({
    tasks: z.int().meta({ description: 'Tarefas acrescentadas (das listas dos serviços)' }),
    templates: z.array(z.string()).meta({ description: 'Listas de tarefas usadas' }),
    due_on: z.string().nullable().meta({ description: 'Prazo de entrega' }),
    payments: z.int().meta({ description: 'Pagamentos criados (plano)' }),
    revisions: z.int().meta({ description: 'Revisões incluídas' }),
  })
  .meta({ id: 'ProjectStartResult' });
export type ProjectStartResult = z.infer<typeof ProjectStartResultSchema>;

/** "8 tarefas (Site Institucional) · entrega a 21/11/2026 · plano de 2 pagamentos" */
export function describeProjectStart(r: ProjectStartResult, formatDay: (iso: string) => string): string {
  const parts = [
    r.tasks ? `${r.tasks} tarefa${r.tasks === 1 ? '' : 's'}${r.templates.length ? ` (${r.templates.join(', ')})` : ''}` : null,
    r.due_on ? `entrega a ${formatDay(r.due_on)}` : null,
    r.payments ? `plano de ${r.payments} pagamento${r.payments === 1 ? '' : 's'}` : null,
    `${r.revisions} revis${r.revisions === 1 ? 'ão incluída' : 'ões incluídas'}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

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
    task_id: z.uuid().nullable().meta({ description: 'Tarefa em que se trabalhou (Pomodoro ou escolhida à mão)' }),
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
    task_id: z.uuid({ error: 'Tarefa inválida.' }).nullish().transform((v) => v ?? null),
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
    task_id: z.uuid({ error: 'Tarefa inválida.' }).nullable(),
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
    expenses: z.number().meta({ description: 'Total das despesas do projeto' }),
    profit: z.number().nullable().meta({ description: 'Valor − despesas' }),
    net_rate: z.number().nullable().meta({ description: 'Lucro ÷ horas (€/hora líquido)' }),
    by_task: z
      .array(z.object({ task_id: z.uuid().nullable(), title: z.string(), seconds: z.int() }))
      .meta({ description: 'Tempo registado por tarefa (mais tempo primeiro; task_id null = sem tarefa)' }),
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

/** Tempo por tarefa (mais tempo primeiro; "Sem tarefa" no fim). Só registos fechados. */
export function timeByTask(
  entries: readonly { task_id: string | null; started_at: string; ended_at: string | null }[],
  titles: ReadonlyMap<string, string>,
): { task_id: string | null; title: string; seconds: number }[] {
  const sums = new Map<string | null, number>();
  for (const e of entries) {
    if (!e.ended_at) continue;
    // Tarefa apagada: conta como "sem tarefa".
    const key = e.task_id && titles.has(e.task_id) ? e.task_id : null;
    sums.set(key, (sums.get(key) ?? 0) + entrySeconds(e));
  }
  return [...sums]
    .filter(([, seconds]) => seconds > 0)
    .map(([task_id, seconds]) => ({ task_id, title: task_id ? titles.get(task_id)! : 'Sem tarefa', seconds }))
    .sort((a, b) => (a.task_id === null ? 1 : 0) - (b.task_id === null ? 1 : 0) || b.seconds - a.seconds);
}

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
    expenses: z.number().meta({ description: 'Total das despesas' }),
  })
  .meta({ id: 'Project' });
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsQuerySchema = z.object({
  state: z.enum(['active', 'completed']).default('active').meta({ description: 'Em curso ou concluídos' }),
});

// -----------------------------------------------------------------------------
// Calendário (prazos, reuniões, pagamentos e tarefas)
// -----------------------------------------------------------------------------

/** followup = próxima ação de um lead (só com followups=true). */
export const CALENDAR_EVENT_TYPES = ['due', 'meeting', 'payment', 'task', 'followup'] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];
export const CALENDAR_EVENT_LABELS: Record<CalendarEventType, string> = {
  due: 'Entrega',
  meeting: 'Reunião',
  payment: 'Pagamento',
  task: 'Tarefa',
  followup: 'Follow-up',
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
    followups: z.enum(['true', 'false']).optional().meta({ description: 'true = também as próximas ações dos leads' }),
  })
  .refine((q) => q.from <= q.to && daysBetween(q.from, q.to) <= 62, { error: 'Intervalo inválido (máximo 62 dias).' });

/** Segunda-feira da semana de um dia (AAAA-MM-DD). */
export function weekStart(isoDate: string): string {
  const weekday = (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  return addDays(isoDate, -weekday);
}

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

export const ClientDeliverableActionSchema = z
  .object({
    action: z.enum(['approve', 'changes']),
    comment: z.string().trim().max(500, { error: 'Máximo de 500 caracteres.' }).optional().transform((v) => v || null),
    name: z.string().trim().max(120).optional().transform((v) => v || null),
  })
  .refine((v) => v.action === 'approve' || !!v.comment, { error: 'Descreva o que gostaria de alterar.', path: ['comment'] })
  .meta({ id: 'ClientDeliverableAction' });
export type ClientDeliverableAction = z.output<typeof ClientDeliverableActionSchema>;

// -----------------------------------------------------------------------------
// Página do cliente: dados
// -----------------------------------------------------------------------------

export interface SharedProject {
  company_name: string;
  contact_name: string | null;
  stage: ProjectStage;
  due_on: string | null;
  completed_at: string | null;
  tasks: { title: string; done: boolean }[];
  next_meeting: { starts_at: string; location: string | null } | null;
  deliverables: { id: string; title: string; url: string | null; status: DeliverableStatus; date: string | null }[];
  /** O cliente pode aprovar entregas ou pedir alterações nesta página. */
  approvals: boolean;
  /** Último contrato enviado (link /c/<token>). */
  contract: { token: string; status: 'enviado' | 'aceite'; title: string } | null;
  payments: { total: number; paid: number; outstanding: number; next: { description: string; amount: number; due_on: string | null } | null } | null;
  revisions: { used: number; included: number } | null;
  from: { name: string; company: string | null; email: string | null; phone: string | null; website: string | null };
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Rentabilidade (Estatísticas)
// -----------------------------------------------------------------------------

const leadRefSchema = z.object({ id: z.uuid(), number: z.int(), company_name: z.string() });

export const ProfitabilitySchema = z
  .object({
    totals: z.object({
      expenses: z.number().meta({ description: 'Despesas registadas nos projetos' }),
      net_rate: z.number().nullable().meta({ description: '€/hora líquido (valor − despesas)' }),
      projects: z.int().meta({ description: 'Clientes com projeto (em curso ou concluído)' }),
      completed: z.int(),
      minutes: z.int().meta({ description: 'Horas registadas (em minutos)' }),
      rate: z.number().nullable().meta({ description: '€/hora médio (projetos com horas e valor)' }),
      avg_days: z.number().nullable().meta({ description: 'Duração média dos projetos concluídos (dias)' }),
      avg_minutes: z.number().nullable().meta({ description: 'Horas médias por projeto concluído (minutos)' }),
    }),
    by_service: z.array(
      z.object({ service: z.string(), projects: z.int(), minutes: z.int(), value: z.number(), rate: z.number().nullable() }),
    ),
    by_client: z.array(
      z.object({
        lead: leadRefSchema,
        minutes: z.int(),
        value: z.number().nullable(),
        expenses: z.number(),
        rate: z.number().nullable(),
        net_rate: z.number().nullable(),
        completed: z.boolean(),
      }),
    ),
    monthly: z.array(z.object({ month: z.string().meta({ description: 'AAAA-MM' }), minutes: z.int(), received: z.number() })),
  })
  .meta({ id: 'Profitability' });
export type Profitability = z.infer<typeof ProfitabilitySchema>;

/** Os últimos N meses (AAAA-MM), do mais antigo para o atual. */
export function lastMonths(today: string, n = 12): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

// -----------------------------------------------------------------------------
// Calendário subscrito (Google Calendar, iPhone, Outlook)
// -----------------------------------------------------------------------------

export const CalendarFeedSchema = z
  .object({ token: z.string().nullable().meta({ description: 'Código do link (/api/v1/calendar/<código>.ics); null = desligado' }) })
  .meta({ id: 'CalendarFeed' });
export type CalendarFeed = z.infer<typeof CalendarFeedSchema>;

export const CalendarFeedUpdateSchema = z
  .object({ enabled: z.boolean(), regenerate: z.boolean().default(false) })
  .meta({ id: 'CalendarFeedUpdate' });

export interface FeedEvent {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** Com hora (reuniões): início e duração. */
  startsAt?: string;
  durationMin?: number;
  /** Dia inteiro (entregas, pagamentos, tarefas): AAAA-MM-DD. */
  date?: string;
}

/** Calendário .ics para subscrever: atualiza-se sozinho no Google Calendar / iPhone. */
export function buildCalendarFeed(events: FeedEvent[], options: { name: string; now?: Date }): string {
  const stamp = icsDate(options.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VNDesign//VNDesign Leads//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(options.name)}`,
    'X-WR-TIMEZONE:Europe/Lisbon',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.startsAt) {
      const start = new Date(e.startsAt);
      lines.push(`DTSTART:${icsDate(start)}`, `DTEND:${icsDate(new Date(start.getTime() + (e.durationMin ?? 30) * 60_000))}`);
    } else if (e.date) {
      const day = e.date.replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`, 'TRANSP:TRANSPARENT');
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

// -----------------------------------------------------------------------------
// Despesas do projeto
// -----------------------------------------------------------------------------

export const ProjectExpenseSchema = z
  .object({ id: z.uuid(), lead_id: z.uuid(), description: z.string(), amount: z.number(), spent_on: z.string(), created_at: z.string() })
  .meta({ id: 'ProjectExpense' });
export type ProjectExpense = z.infer<typeof ProjectExpenseSchema>;

export const ProjectExpenseCreateSchema = z
  .object({
    description: z.string({ error: 'Descreve a despesa.' }).trim().min(1, { error: 'Descreve a despesa.' }).max(200),
    amount: z
      .number({ error: 'Indica o valor.' })
      .positive({ error: 'O valor tem de ser maior que zero.' })
      .max(9_999_999)
      .transform((v) => Math.round(v * 100) / 100),
    spent_on: z.iso.date({ error: 'Data inválida.' }).optional(),
  })
  .meta({ id: 'ProjectExpenseCreate' });
export type ProjectExpenseCreate = z.output<typeof ProjectExpenseCreateSchema>;

/** Lucro: valor − despesas; ganho líquido por hora (só com 15 minutos ou mais). */
export function projectProfit(value: number | null | undefined, expenses: number, minutes: number): { profit: number | null; net_rate: number | null } {
  if (!value) return { profit: expenses ? -expenses : null, net_rate: null };
  const profit = Math.round((value - expenses) * 100) / 100;
  return { profit, net_rate: minutes >= 15 ? Math.round((profit / (minutes / 60)) * 100) / 100 : null };
}

// -----------------------------------------------------------------------------
// Briefing online (/b/<código>)
// -----------------------------------------------------------------------------

export const BriefingFileSchema = z.object({ name: z.string(), path: z.string(), size: z.int(), type: z.string() });
export type BriefingFile = z.infer<typeof BriefingFileSchema>;

export const ProjectBriefingSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    token: z.string().meta({ description: 'Link do cliente: /b/<token>' }),
    questions: z.array(z.string()),
    answers: z.array(z.string()),
    files: z.array(BriefingFileSchema),
    status: z.enum(['pendente', 'respondido']),
    submitted_at: z.string().nullable(),
    created_at: z.string(),
  })
  .meta({ id: 'ProjectBriefing' });
export type ProjectBriefing = z.infer<typeof ProjectBriefingSchema>;

/** Limites dos ficheiros do briefing. */
export const BRIEFING_MAX_FILES = 10;
export const BRIEFING_MAX_FILE_BYTES = 15 * 1024 * 1024;

// Filtros e ordem da lista de Projetos.
export const PROJECT_FILTERS = ['todos', 'atrasados', 'pagamentos', 'semana'] as const;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];
export const PROJECT_FILTER_LABELS: Record<ProjectFilter, string> = {
  todos: 'Todos',
  atrasados: 'Atrasados',
  pagamentos: 'Pagamentos em atraso',
  semana: 'Entregam esta semana',
};

export const PROJECT_SORTS = ['prazo', 'valor', 'fase', 'manual'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = { prazo: 'Prazo', valor: 'Valor', fase: 'Fase', manual: 'A minha ordem' };
/** "A minha ordem" (arrastar os projetos): ids pela ordem escolhida, guardados na conta. */
export const PROJECTS_ORDER_PREFERENCE = 'projects.order';

type Filterable = Pick<Project, 'info' | 'payments' | 'value' | 'lead'>;

/** O projeto entra neste filtro? ("semana": entrega de hoje a 6 dias.) */
export function projectMatches<P extends Filterable>(p: P, filter: ProjectFilter, today: string): boolean {
  const due = p.info.due_on;
  if (filter === 'atrasados') return !!due && due < today;
  if (filter === 'pagamentos') return p.payments.overdue > 0;
  if (filter === 'semana') return !!due && due >= today && due <= addDays(today, 6);
  return true;
}

/**
 * Ordena: prazo (sem prazo no fim), valor (maior primeiro), fase (Entrega primeiro, depois prazo)
 * ou "a minha ordem" (a que se arrastou; os projetos novos ficam no fim, pelo prazo).
 */
export function sortProjects<P extends Filterable>(projects: readonly P[], sort: ProjectSort, manual: readonly string[] = []): P[] {
  const byDue = (a: P, b: P) => (a.info.due_on ?? '9999-12-31').localeCompare(b.info.due_on ?? '9999-12-31');
  const list = [...projects];
  if (sort === 'manual') {
    const pos = new Map(manual.map((id, i) => [id, i]));
    const at = (p: P) => pos.get(p.lead.id) ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => at(a) - at(b) || byDue(a, b));
  }
  if (sort === 'valor') return list.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || byDue(a, b));
  if (sort === 'fase') return list.sort((a, b) => PROJECT_STAGES.indexOf(b.info.stage) - PROJECT_STAGES.indexOf(a.info.stage) || byDue(a, b));
  return list.sort(byDue);
}

/**
 * Nova ordem completa depois de arrastar numa lista filtrada: os projetos que se
 * veem ficam pela nova ordem nos lugares que ocupavam; os outros não mexem.
 */
export function reorderSubset(full: readonly string[], subset: readonly string[]): string[] {
  const inSubset = new Set(subset);
  const next = [...full];
  let j = 0;
  for (let i = 0; i < next.length; i++) if (inSubset.has(next[i]!)) next[i] = subset[j++]!;
  return next;
}
