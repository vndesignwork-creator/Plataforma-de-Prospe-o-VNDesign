/**
 * Como um aviso aparece no sino: uma etiqueta curta com a cor do tipo
 * ("Lembrete", "Resposta", "Email aberto"…), o texto principal sem o emoji e sem
 * repetir o nome do lead (que já vai na linha de cima), um detalhe só quando
 * acrescenta alguma coisa, e a ação rápida que faz sentido.
 */
import { todayIso } from './format';
import { notificationTitle, type Notification } from './team-work';

export type NotificationTone = 'accent' | 'warning' | 'success' | 'info' | 'violet' | 'danger' | 'muted';
/** Ícone: o tipo do aviso ou uma variante (reunião, email devolvido, "não contactar"). */
export type NotificationIcon = Notification['kind'] | 'meeting' | 'bounce' | 'blocked';
export type NotificationAction = 'task' | 'reply' | 'call';

export interface NotificationView {
  label: string;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  detail: string | null;
  action: NotificationAction | null;
}

type Input = Pick<Notification, 'kind' | 'title' | 'text' | 'task_id'> & {
  lead: { number: number; company_name: string; phone?: string | null } | null;
};

/** Textos que não dizem nada de novo (o tipo já o diz). */
const GENERIC = new Set(['Lembrete da tarefa']);
/** Tarefas e menções mostram o texto entre aspas (título da tarefa, início do comentário). */
const QUOTED = new Set<Notification['kind']>(['task_assigned', 'mention']);

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}️?\s*)+/u;
export const stripLeadingEmoji = (text: string) => text.replace(LEADING_EMOJI, '').trim();

const capitalize = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

/** Tira " · #13 O Quintal" / " · O Quintal" do fim e "O Quintal · " do início (o lead já aparece à parte). */
function withoutLead(text: string, lead: Input['lead']): string {
  if (!lead) return text;
  const name = lead.company_name;
  for (const suffix of [` · #${lead.number} ${name}`, ` · ${name}`]) if (text.endsWith(suffix)) text = text.slice(0, -suffix.length);
  if (text.startsWith(`${name} · `)) text = text.slice(name.length + 3);
  return text.trim();
}

export function describeNotification(n: Input, actor: string | null): NotificationView {
  const raw = notificationTitle(n, actor);
  const company = n.lead?.company_name ?? null;
  let title = withoutLead(stripLeadingEmoji(raw), n.lead);
  // "O Quintal respondeu" → "Respondeu" (o nome está na linha de cima).
  if (company && title.startsWith(`${company} `)) title = capitalize(title.slice(company.length + 1));
  let detail: string | null = withoutLead(n.text.trim(), n.lead).replace(/\s*Bom momento para ligar!$/, '');
  if (!detail || GENERIC.has(detail) || detail === title || detail === company || detail === raw) detail = null;
  if (!title || title === company) {
    title = detail ?? company ?? '';
    detail = null;
  }

  let label: string;
  let tone: NotificationTone;
  let icon: NotificationIcon = n.kind;
  let action: NotificationAction | null = null;
  switch (n.kind) {
    case 'task_assigned':
      [label, tone] = ['Tarefa nova', 'warning'];
      break;
    case 'mention':
      [label, tone] = ['Menção', 'warning'];
      break;
    case 'reminder':
      if (/^Reunião\b/.test(title)) [label, tone, icon] = ['Reunião', 'accent', 'meeting'];
      else [label, tone, action] = ['Lembrete', 'accent', n.task_id ? 'task' : null];
      break;
    case 'daily':
      [label, tone] = ['Para hoje', 'accent'];
      break;
    case 'reply':
      if (raw.startsWith('📭') || /devolvido/i.test(raw)) [label, tone, icon] = ['Email devolvido', 'danger', 'bounce'];
      else if (raw.startsWith('🚫')) [label, tone, icon] = ['Não contactar', 'danger', 'blocked'];
      else if (raw.startsWith('👎')) [label, tone] = ['Sem interesse', 'muted'];
      else {
        [label, tone, action] = ['Resposta', 'success', n.lead ? 'reply' : null];
        // "Respondeu" + assunto → só o assunto.
        if (title === 'Respondeu' && detail) [title, detail] = [`“${detail}”`, null];
      }
      break;
    case 'email_open':
      [label, tone, action] = [/^Carregou/.test(title) ? 'Link clicado' : 'Email aberto', 'info', n.lead?.phone ? 'call' : null];
      break;
    case 'site_form':
      [label, tone] = ['Pedido pelo site', 'violet'];
      break;
    case 'client':
      [label, tone] = ['Cliente', 'violet'];
      break;
    default:
      [label, tone] = ['Plataforma', 'muted'];
  }
  // "Email devolvido" / "Novo pedido pelo site" já é a etiqueta: o detalhe passa a título.
  if (detail && title.toLowerCase().replace(/^nov[oa] /, '') === label.toLowerCase()) [title, detail] = [detail, null];
  if (detail && QUOTED.has(n.kind)) detail = `“${detail}”`;
  return { label, tone, icon, title, detail, action };
}

export type NotificationDay = 'today' | 'yesterday' | 'week' | 'older';
export const NOTIFICATION_DAY_LABELS: Record<NotificationDay, string> = { today: 'Hoje', yesterday: 'Ontem', week: 'Esta semana', older: 'Mais antigos' };

/** Em que grupo do sino fica um aviso (pelo dia em Lisboa). */
export function notificationDay(createdAt: string, now: Date = new Date()): NotificationDay {
  const day = todayIso(new Date(createdAt));
  const days = Math.round((Date.parse(`${todayIso(now)}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? 'week' : 'older';
}
