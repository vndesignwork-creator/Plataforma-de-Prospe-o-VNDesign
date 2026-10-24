/**
 * Trabalho em equipa: comentários com @menções na linha do tempo, avisos
 * ("deram-te uma tarefa", "mencionaram-te"), a lista "As minhas tarefas" e a
 * ordem dos cartões da ficha (cada pessoa escolhe a sua).
 */
import { z } from 'zod';
import { LeadTaskSchema } from './tasks';

// -----------------------------------------------------------------------------
// @menções
// -----------------------------------------------------------------------------
export interface MentionMember {
  user_id: string;
  name: string;
}

/** Minúsculas e sem acentos (mantém o comprimento de um texto em NFC). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Como cada pessoa pode ser mencionada: o nome completo e, se não houver outro igual, só o primeiro nome. */
function mentionAliases(members: readonly MentionMember[]): { alias: string; user_id: string }[] {
  const firsts = new Map<string, number>();
  for (const m of members) {
    const first = fold(m.name.trim().split(/\s+/)[0] ?? '');
    if (first) firsts.set(first, (firsts.get(first) ?? 0) + 1);
  }
  const out: { alias: string; user_id: string }[] = [];
  for (const m of members) {
    const full = fold(m.name.trim().replace(/\s+/g, ' '));
    if (!full) continue;
    out.push({ alias: full, user_id: m.user_id });
    const first = full.split(' ')[0]!;
    if (first !== full && firsts.get(first) === 1) out.push({ alias: first, user_id: m.user_id });
  }
  // Os mais compridos primeiro ("@Ana Rita" antes de "@Ana").
  return out.sort((a, b) => b.alias.length - a.alias.length);
}

/** Pedaços do texto: as @menções a pessoas da equipa marcadas (para destacar e para saber quem avisar). */
export function mentionParts(body: string, members: readonly MentionMember[]): { text: string; user_id?: string }[] {
  const text = body.normalize('NFC');
  const folded = fold(text);
  const aliases = mentionAliases(members);
  const parts: { text: string; user_id?: string }[] = [];
  let plain = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@' && !isWordChar(text[i - 1])) {
      const hit = aliases.find((a) => folded.startsWith(a.alias, i + 1) && !isWordChar(text[i + 1 + a.alias.length]));
      if (hit) {
        if (i > plain) parts.push({ text: text.slice(plain, i) });
        const end = i + 1 + hit.alias.length;
        parts.push({ text: text.slice(i, end), user_id: hit.user_id });
        i = plain = end;
        continue;
      }
    }
    i++;
  }
  if (plain < text.length) parts.push({ text: text.slice(plain) });
  return parts;
}

/** Ids das pessoas mencionadas (sem repetir). */
export function findMentions(body: string, members: readonly MentionMember[]): string[] {
  return [...new Set(mentionParts(body, members).flatMap((p) => (p.user_id ? [p.user_id] : [])))];
}

/** O texto a seguir ao "@" que se está a escrever (para sugerir nomes), ou null. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0 || isWordChar(before[at - 1])) return null;
  const query = before.slice(at + 1);
  // Até duas palavras ("@Ana Ri"), sem mudar de linha.
  if (query.length > 30 || /\n/.test(query) || query.split(' ').length > 2) return null;
  return { start: at, query };
}

export const CommentCreateSchema = z
  .object({
    body: z
      .string({ error: 'Escreve o comentário.' })
      .trim()
      .min(1, { error: 'Escreve o comentário.' })
      .max(2000, { error: 'Máximo de 2000 caracteres.' }),
    mentions: z
      .array(z.uuid())
      .max(20)
      .default([])
      .meta({ description: 'Pessoas mencionadas (ids de GET /team/names); cada uma recebe um aviso' }),
  })
  .meta({ id: 'CommentCreate' });
export type CommentCreate = z.output<typeof CommentCreateSchema>;

// -----------------------------------------------------------------------------
// Avisos
// -----------------------------------------------------------------------------
export const NOTIFICATION_KINDS = ['task_assigned', 'mention'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NotificationSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(NOTIFICATION_KINDS),
    lead_id: z.uuid().nullable(),
    task_id: z.uuid().nullable(),
    activity_id: z.uuid().nullable(),
    actor_user_id: z.uuid().nullable(),
    text: z.string().meta({ description: 'Título da tarefa ou início do comentário' }),
    read_at: z.string().nullable(),
    created_at: z.string(),
    lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string() }).nullable(),
  })
  .meta({ id: 'Notification' });
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListSchema = z
  .object({ data: z.array(NotificationSchema), unread: z.int() })
  .meta({ id: 'NotificationList' });
export type NotificationList = z.infer<typeof NotificationListSchema>;

export const NotificationReadSchema = z
  .object({
    ids: z.array(z.uuid()).max(100).optional().meta({ description: 'Avisos a marcar como lidos' }),
    all: z.boolean().optional().meta({ description: 'true = todos' }),
  })
  .refine((v) => v.all || (v.ids?.length ?? 0) > 0, { error: 'Indica os avisos.' })
  .meta({ id: 'NotificationRead' });
export type NotificationRead = z.infer<typeof NotificationReadSchema>;

/** "Rui deu-te uma tarefa: …" / "Rui mencionou-te: …" */
export function notificationTitle(n: Pick<Notification, 'kind'>, actor: string | null): string {
  const who = actor ?? 'Alguém';
  return n.kind === 'task_assigned' ? `${who} deu-te uma tarefa` : `${who} mencionou-te`;
}

// -----------------------------------------------------------------------------
// As minhas tarefas
// -----------------------------------------------------------------------------
export const TaskListQuerySchema = z
  .object({
    assigned: z
      .union([z.enum(['me', 'none', 'all']), z.uuid()])
      .default('me')
      .meta({ description: 'De quem: "me" (as minhas; para o dono, também as sem responsável), "none" (sem responsável), "all" ou o id de uma pessoa' }),
    limit: z.coerce.number().int().min(1).max(500).default(500),
  })
  .meta({ id: 'TaskListQuery' });
export type TaskListQuery = z.output<typeof TaskListQuerySchema>;

export const TaskListItemSchema = LeadTaskSchema.extend({
  lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), project_title: z.string().nullable(), status: z.string() }),
}).meta({ id: 'TaskListItem' });
export type TaskListItem = z.infer<typeof TaskListItemSchema>;

/** Grupos da página Tarefas, pelo prazo. */
export type TaskGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';
export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  overdue: 'Em atraso',
  today: 'Hoje',
  week: 'Próximos 7 dias',
  later: 'Mais tarde',
  none: 'Sem prazo',
};

export function taskGroup(due: string | null, today: string, weekEnd: string): TaskGroup {
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= weekEnd) return 'week';
  return 'later';
}

// -----------------------------------------------------------------------------
// Ordem dos cartões da ficha (coluna lateral)
// -----------------------------------------------------------------------------
export const LEAD_CARDS = ['tasks', 'payments', 'projects', 'brand_kit', 'files', 'meetings', 'notes', 'proposals', 'contracts', 'activity'] as const;
export type LeadCard = (typeof LEAD_CARDS)[number];
export const LEAD_CARD_LABELS: Record<LeadCard, string> = {
  tasks: 'Tarefas',
  payments: 'Pagamentos',
  projects: 'Projetos do cliente',
  brand_kit: 'Kit da marca',
  files: 'Ficheiros',
  meetings: 'Reuniões',
  notes: 'Notas',
  proposals: 'Propostas',
  contracts: 'Contratos',
  activity: 'Linha do tempo',
};
export const LEAD_CARDS_PREFERENCE = 'lead.cards';

export const LeadCardLayoutSchema = z.object({
  order: z.array(z.string()).max(40).default([]),
  hidden: z.array(z.string()).max(40).default([]),
});
export type LeadCardLayout = z.infer<typeof LeadCardLayoutSchema>;

/** Cartões pela ordem escolhida (os novos ou nunca arrumados ficam onde estavam por omissão). */
export function arrangeKeys<K extends string>(defaults: readonly K[], layout: Partial<LeadCardLayout> | null | undefined): K[] {
  const order = (layout?.order ?? []).filter((k): k is K => (defaults as readonly string[]).includes(k));
  const out = [...new Set(order)];
  defaults.forEach((k, i) => {
    if (out.includes(k)) return;
    // Entra a seguir ao cartão que, por omissão, vinha antes dele.
    const prev = defaults.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
  });
  return out;
}

/** Os cartões da ficha pela ordem escolhida. */
export function arrangeCards(layout: Partial<LeadCardLayout> | null | undefined): LeadCard[] {
  return arrangeKeys(LEAD_CARDS, layout);
}

/** A Linha do tempo nunca se esconde (é o histórico do lead). */
export const ALWAYS_SHOWN_CARDS: readonly LeadCard[] = ['activity'];
export function isCardHidden(layout: Partial<LeadCardLayout> | null | undefined, card: LeadCard): boolean {
  return !ALWAYS_SHOWN_CARDS.includes(card) && (layout?.hidden ?? []).includes(card);
}

// -----------------------------------------------------------------------------
// Cartões do Dashboard (dono/administrador)
// -----------------------------------------------------------------------------
export const DASHBOARD_CARDS = ['summary', 'today', 'hot', 'pipeline', 'projects', 'reconnect'] as const;
export type DashboardCard = (typeof DASHBOARD_CARDS)[number];
export const DASHBOARD_CARD_LABELS: Record<DashboardCard, string> = {
  summary: 'Resumo (4 números)',
  today: 'Hoje',
  hot: 'Leads mais quentes',
  pipeline: 'Pipeline',
  projects: 'Projetos',
  reconnect: 'Clientes antigos',
};
export const DASHBOARD_CARDS_PREFERENCE = 'dashboard.cards';
/** O "Hoje" fica sempre (é o essencial do Dashboard). */
export const DASHBOARD_ALWAYS_SHOWN: readonly DashboardCard[] = ['today'];
