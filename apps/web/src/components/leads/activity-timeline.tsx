'use client';

import {
  ACTIVITY_TYPE_LABELS,
  AI_EMAIL_KIND_LABELS,
  PROPOSAL_STATUS_LABELS,
  PROJECT_STAGE_LABELS,
  describeProjectStart,
  type AiEmailKind,
  type ProjectStage,
  type ProposalStatus,
  LEAD_FIELD_LABELS,
  LEAD_STATUS_META,
  formatDate,
  formatDateTime,
  type Activity,
  type EmailTracking,
  type LeadStatus,
} from '@vndesign/core';
import {
  Eye,
  MousePointerClick,
  ClipboardList,
  FileCheck2,
  FileSignature,
  Zap,
  BadgeCheck,
  Milestone,
  RefreshCcw,
  Send,
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit3,
  FileText,
  Gauge,
  ListPlus,
  SquareCheck,
  Sparkles,
  GitMerge,
  Mail,
  MessageSquare,
  MailOpen,
  Phone,
  Wallet,
  CalendarPlus,
  CalendarX,
  BriefcaseBusiness,
  RotateCcw,
  Plus,
  Repeat,
  ShieldOff,
  Trash2,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useActivities, useEmailTracking, useLogActivity, useTeamNames } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { DictateButton, appendDictation } from '@/components/ui/dictate-button';

export const ICONS: Partial<Record<Activity["type"], LucideIcon>> = {
  created: Plus,
  updated: Edit3,
  status_changed: Repeat,
  note: MessageSquare,
  email_copied: Copy,
  email_mailto: Mail,
  email_sent: Mail,
  call_logged: Phone,
  merged: GitMerge,
  follow_up_scheduled: CalendarClock,
  follow_up_done: CheckCircle2,
  template_used: MessageSquare,
  anonymized: ShieldOff,
  archived: Archive,
  unarchived: ArchiveRestore,
  audit_run: Gauge,
  proposal_generated: FileText,
  ai_email_generated: Sparkles,
  task_completed: SquareCheck,
  tasks_added: ListPlus,
  email_received: MailOpen,
  payment_received: Wallet,
  meeting_scheduled: CalendarPlus,
  meeting_canceled: CalendarX,
  project_completed: BriefcaseBusiness,
  project_reopened: RotateCcw,
  project_stage_changed: Milestone,
  revision_requested: RefreshCcw,
  deliverable_sent: Send,
  deliverable_approved: BadgeCheck,
  project_started: Zap,
  contract_sent: FileSignature,
  contract_accepted: FileCheck2,
  briefing_received: ClipboardList,
  email_opened: Eye,
  email_clicked: MousePointerClick,
};

/** "Aberto 3× · último a …" num email enviado pela plataforma (com o rastreio ligado). */
function OpenStatus({ tracking }: { tracking: EmailTracking | undefined }) {
  if (!tracking) return null;
  const opened = tracking.opens > 0;
  return (
    <p className={cn('mt-1 inline-flex items-center gap-1 text-xs', opened ? 'text-success' : 'text-muted')}>
      {opened ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
      {opened
        ? `Aberto ${tracking.opens}× · última vez a ${formatDateTime(tracking.last_opened_at!)}${tracking.clicks ? ` · ${tracking.clicks} clique${tracking.clicks === 1 ? '' : 's'}` : ''}`
        : 'Ainda não foi aberto'}
    </p>
  );
}

const fieldLabel = (f: string) => (LEAD_FIELD_LABELS as Record<string, string>)[f] ?? f;
const statusLabel = (s: unknown) => LEAD_STATUS_META[s as LeadStatus]?.label ?? String(s);

export function describe(a: Activity): string | null {
  const p = a.payload as Record<string, unknown>;
  switch (a.type) {
    case 'status_changed':
      return `${statusLabel(p.from)} → ${statusLabel(p.to)}`;
    case 'updated':
      return Array.isArray(p.fields) ? p.fields.map((f) => fieldLabel(String(f))).join(', ') : null;
    case 'follow_up_scheduled':
      return `${p.snoozed ? 'Adiado: ' : ''}${p.text ?? 'Follow-up'} para ${formatDate(String(p.on))}`;
    case 'merged': {
      const numbers = Array.isArray(p.merged_numbers) ? p.merged_numbers : [];
      return numbers.length ? `Juntou ${numbers.map((n) => `#${n}`).join(', ')}` : 'Dados de um novo registo';
    }
    case 'created':
      return p.source ? `Origem: ${String(p.source)}` : null;
    case 'email_copied':
      return p.template ? `Modelo: ${String(p.template)}` : p.part === 'subject' ? 'Assunto' : p.part === 'body' ? 'Corpo do email' : null;
    case 'email_sent':
      if (p.via === 'platform') {
        const files = Array.isArray(p.attachments) ? (p.attachments as string[]) : [];
        return [
          `Enviado pela plataforma para ${String(p.to)}`,
          p.template ? `Modelo: ${String(p.template)}` : null,
          files.length ? `Anexo: ${files.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
      }
      return p.template ? `Modelo: ${String(p.template)}` : null;
    case 'template_used':
      if (p.via === 'whatsapp') return p.template ? `WhatsApp · Modelo: ${String(p.template)}` : 'WhatsApp';
      return p.template ? `Modelo: ${String(p.template)}` : null;
    case 'email_mailto':
    case 'call_logged':
      return p.template ? `Modelo: ${String(p.template)}` : null;
    case 'payment_received':
      return [p.label ? String(p.label) : null, p.method ? String(p.method) : null].filter(Boolean).join(' · ') || null;
    case 'meeting_scheduled':
      return [p.location ? String(p.location) : null, p.invite_sent_to ? `Convite enviado para ${String(p.invite_sent_to)}` : null]
        .filter(Boolean)
        .join(' · ') || null;
    case 'meeting_canceled':
      return p.notified ? 'O cliente foi avisado' : null;
    case 'project_stage_changed': {
      const stage = (v: unknown) => PROJECT_STAGE_LABELS[v as ProjectStage] ?? String(v);
      return p.from ? `${stage(p.from)} → ${stage(p.to)}` : null;
    }
    case 'revision_requested':
      return [p.label ? String(p.label) : null, p.via === 'cliente' ? 'pedido pelo cliente na página do projeto' : null].filter(Boolean).join(' · ') || null;
    case 'deliverable_approved':
      return p.via === 'cliente' ? 'Aprovada pelo cliente na página do projeto' : null;
    case 'project_started':
      return describeProjectStart(
        {
          tasks: Number(p.tasks ?? 0),
          templates: Array.isArray(p.templates) ? (p.templates as string[]) : [],
          due_on: p.due_on ? String(p.due_on) : null,
          payments: Number(p.payments ?? 0),
          revisions: Number(p.revisions ?? 0),
        },
        formatDate,
      );
    case 'contract_sent':
      return p.title ? String(p.title) : null;
    case 'contract_accepted':
      return p.name ? `Aceite por ${String(p.name)}` : null;
    case 'email_opened':
      return a.body ? `“${a.body}”` : null;
    case 'email_clicked':
      return [a.body ? `“${a.body}”` : null, p.url ? String(p.url).replace(/^https?:\/\/(www\.)?/, '') : null].filter(Boolean).join(' → ') || null;
    case 'briefing_received':
      return `${Number(p.answers ?? 0)} resposta(s)${Number(p.files ?? 0) ? ` · ${Number(p.files)} ficheiro(s)` : ''}`;
    case 'email_received':
      return [p.from ? `De ${String(p.from)}` : null, p.subject ? `“${String(p.subject)}”` : null, p.auto ? 'resposta automática' : null]
        .filter(Boolean)
        .join(' · ') || null;
    case 'follow_up_done':
      if (typeof p.sequence_step === 'number') {
        return [`Follow-up ${p.sequence_step} enviado por email ✓`, p.text && p.on ? `Próximo: ${String(p.text)} a ${formatDate(String(p.on))}` : null]
          .filter(Boolean)
          .join(' · ');
      }
      return [p.done_text ? `${String(p.done_text)} ✓` : null, p.on ? `Próximo: ${formatDate(String(p.on))}` : 'Sem próxima ação']
        .filter(Boolean)
        .join(' · ');
    case 'audit_run': {
      const parts = [
        typeof p.pagespeed === 'number' ? `PageSpeed ${p.pagespeed}` : null,
        typeof p.issues === 'number' ? (p.issues === 1 ? '1 problema' : `${p.issues} problemas`) : null,
      ];
      return parts.filter(Boolean).join(' · ') || null;
    }
    case 'proposal_generated':
      return [
        p.code ? `Proposta ${String(p.code)}` : null,
        p.total ? String(p.total) : null,
        p.status ? PROPOSAL_STATUS_LABELS[p.status as ProposalStatus] : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'ai_email_generated':
      return p.kind ? AI_EMAIL_KIND_LABELS[p.kind as AiEmailKind] ?? null : null;
    case 'archived':
      return p.auto ? 'Automático: em "Sem interesse" há mais tempo do que o definido' : null;
    case 'task_completed':
      return p.title ? String(p.title) : null;
    case 'tasks_added':
      return [p.template ? `Lista "${String(p.template)}"` : null, typeof p.count === 'number' ? `${p.count} tarefa${p.count === 1 ? '' : 's'}` : null]
        .filter(Boolean)
        .join(' · ') || null;
    case 'anonymized':
      return p.added_to_do_not_contact ? 'Acrescentado à lista "não contactar"' : null;
    default:
      return null;
  }
}

/** No telemóvel, a linha do tempo mostra só os registos mais recentes (o resto com "Ver tudo"). */
const MOBILE_VISIBLE = 3;

/**
 * Registos que o próprio utilizador pode apagar: os que escreveu à mão (um engano
 * acontece). O histórico automático (estados, propostas, tarefas…) fica sempre.
 */
const DELETABLE: readonly Activity['type'][] = ['note', 'call_logged', 'email_sent'];

/**
 * No computador, a linha do tempo não passa do fim da coluna principal: mede o espaço
 * até lá e devolve a altura máxima (null = cabe tudo).
 */
function useFitHeight(fitTo: RefObject<HTMLElement | null> | undefined, list: RefObject<HTMLElement | null>, deps: unknown) {
  const [max, setMax] = useState<number | null>(null);
  useEffect(() => {
    const main = fitTo?.current;
    const el = list.current;
    if (!main || !el) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!wide.matches) return setMax(null);
        // Espaço até ao fim da coluna principal, menos a barra do "Ver tudo".
        const available = main.getBoundingClientRect().bottom - el.getBoundingClientRect().top - 48;
        const next = el.scrollHeight > available + 24 ? Math.max(Math.round(available), 240) : null;
        setMax((prev) => (prev === next || (prev !== null && next !== null && Math.abs(prev - next) < 4) ? prev : next));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    const aside = el.closest('aside');
    if (aside) ro.observe(aside);
    wide.addEventListener('change', measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      wide.removeEventListener('change', measure);
    };
  }, [fitTo, list, deps]);
  return max;
}

/** "Registar contacto": o email primeiro (o caso mais comum); "Outro registo" é uma nota com data. */
const LOG_TYPES = [
  { value: 'email_sent', label: 'Email enviado' },
  { value: 'call_logged', label: 'Chamada' },
  { value: 'note', label: 'Outro registo' },
];

export function ActivityTimeline({
  leadId,
  currentUserId,
  fitTo,
  actions,
}: {
  leadId: string;
  currentUserId?: string;
  /** Botões extra no cabeçalho (ex.: "Notas com IA"). */
  actions?: ReactNode;
  /** Coluna principal da ficha: no computador, a linha do tempo recolhe-se ao chegar ao fim dela. */
  fitTo?: RefObject<HTMLElement | null>;
}) {
  const { data: all, isLoading } = useActivities(leadId);
  // Equipa: quem fez cada coisa e filtro por pessoa.
  const { data: team } = useTeamNames();
  const hasTeam = (team?.length ?? 0) > 1;
  const names = new Map((team ?? []).map((m) => [m.user_id, m.user_id === currentUserId ? 'tu' : m.name]));
  const [person, setPerson] = useState('');
  const data = person ? all?.filter((a) => a.actor_user_id === person) : all;
  // Só há aberturas a mostrar se algum email enviado pela plataforma levou o rastreio.
  const tracked = (data ?? []).some((a) => a.type === 'email_sent' && !!(a.payload as Record<string, unknown>).tracking_id);
  const { data: tracking } = useEmailTracking(leadId, tracked);
  const opened = new Map((tracking ?? []).map((t) => [t.id, t]));
  const [expanded, setExpanded] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [collapsed, setCollapsed] = useCollapsed('linha-do-tempo');
  // Ao expandir volta a medir (a lista só existe com o cartão aberto).
  const fitHeight = useFitHeight(fitTo, listRef, collapsed ? null : data);
  const clipped = !expanded && fitHeight !== null;
  const log = useLogActivity(leadId);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('email_sent');
  const [body, setBody] = useState('');

  function close() {
    setOpen(false);
    setBody('');
    setType('email_sent');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (type === 'note' && !body.trim()) return;
    try {
      await log.mutateAsync({ type, body: body.trim() || undefined });
      close();
      toast.success('Registado na linha do tempo.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function removeNote(activityId: string) {
    setConfirmId(null);
    try {
      await api(`/leads/${leadId}/activities/${activityId}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['activities', leadId] });
      toast.success('Registo apagado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Linha do tempo"
        as="h2"
        description={
          collapsed && all?.length
            ? `${all.length} registo${all.length === 1 ? '' : 's'} · último: ${ACTIVITY_TYPE_LABELS[all[0]!.type] ?? 'registo'}, ${formatDateTime(all[0]!.created_at)}`
            : undefined
        }
        className={collapsed && !open ? 'border-b-0' : undefined}
        actions={
          open ? null : (
            <>
              {hasTeam ? (
                <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filtrar por pessoa" className="h-8 w-auto max-w-40 text-sm">
                  <option value="">Todos</option>
                  {(team ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === currentUserId ? `${m.name} (tu)` : m.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              {actions}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCollapsed(false);
                  setOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Registar
              </Button>
              <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label="Linha do tempo" />
            </>
          )
        }
      />
      {open ? (
        <form
          onSubmit={submit}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          aria-label="Registar contacto"
          className="flex flex-col gap-2 border-b border-border p-4"
        >
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de registo" className="h-9">
            {LOG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <label htmlFor="activity-body" className="sr-only">
            Texto do registo
          </label>
          <Textarea
            id="activity-body"
            rows={3}
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              type === 'note'
                ? 'O que aconteceu? (ex.: encontrei o dono na feira, pediu portefólio)'
                : type === 'call_logged'
                  ? 'O que aconteceu? (ex.: liguei, pediu para voltar a ligar em março)'
                  : 'O que enviaste? (ex.: proposta do site, com 2 opções de preço)'
            }
          />
          <div className="flex justify-end gap-2">
            <DictateButton size="sm" onText={(spoken) => setBody((current) => appendDictation(current, spoken))} className="mr-auto" />
            <Button type="button" size="sm" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={log.isPending} disabled={type === 'note' && !body.trim()}>
              Registar
            </Button>
          </div>
        </form>
      ) : null}
      {collapsed ? null : isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <>
          <div className="relative">
            <ol
              ref={listRef}
              className="flex flex-col gap-0 p-4"
              aria-label="Atividade do lead"
              style={clipped ? { maxHeight: fitHeight!, overflow: 'hidden' } : undefined}
            >
              {(data ?? []).map((a, i) => {
                const Icon = ICONS[a.type] ?? Edit3;
                const detail = describe(a);
                // Telemóvel: só os mais recentes até tocar em "Ver tudo".
                const hidden = !expanded && i >= MOBILE_VISIBLE;
                const lastShown = !expanded && i === MOBILE_VISIBLE - 1;
                const canDelete = DELETABLE.includes(a.type) && a.actor_user_id === currentUserId && !a.actor_token_id;
                return (
                  <li
                    key={a.id}
                    className={cn('relative flex gap-3 pb-4 last:pb-0', hidden && 'max-lg:hidden', lastShown && 'max-lg:pb-0')}
                  >
                    <span className={cn('absolute top-8 bottom-0 left-4 w-px bg-border', lastShown && 'max-lg:hidden')} aria-hidden />
                    <span className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2">
                      <Icon className="h-4 w-4 text-muted" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="flex items-start justify-between gap-2 text-sm">
                        <span className="font-medium">{ACTIVITY_TYPE_LABELS[a.type]}</span>
                        {canDelete ? (
                          confirmId === a.id ? (
                            <span className="flex shrink-0 items-center gap-1 text-xs">
                              <span className="text-muted">Apagar?</span>
                              <button
                                type="button"
                                onClick={() => void removeNote(a.id)}
                                className="rounded px-1.5 py-0.5 font-medium text-danger hover:bg-danger-soft"
                              >
                                Sim
                              </button>
                              <button type="button" onClick={() => setConfirmId(null)} className="rounded px-1.5 py-0.5 hover:bg-surface-3">
                                Não
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmId(a.id)}
                              className="rounded p-0.5 text-muted hover:text-danger"
                              aria-label="Apagar registo"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )
                        ) : null}
                      </p>
                      {detail ? <p className="text-sm text-muted">{detail}</p> : null}
                      {a.body && a.type !== 'email_opened' && a.type !== 'email_clicked' ? (
                        <p className="mt-1 text-sm break-words whitespace-pre-line">{a.body}</p>
                      ) : null}
                      {a.type === 'email_sent' ? <OpenStatus tracking={opened.get(String((a.payload as Record<string, unknown>).tracking_id))} /> : null}
                      <p className="mt-0.5 text-xs text-muted tabular">
                        <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                        {a.actor_token_id ? ' · via API' : hasTeam && a.actor_user_id && names.get(a.actor_user_id) ? ` · ${names.get(a.actor_user_id)}` : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {clipped ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-16 bg-gradient-to-t from-surface to-transparent lg:block" aria-hidden />
            ) : null}
          </div>
          {(data?.length ?? 0) > MOBILE_VISIBLE || fitHeight !== null ? (
            <div
              className={cn(
                'flex justify-end border-t border-border px-4 py-2',
                (data?.length ?? 0) <= MOBILE_VISIBLE && 'max-lg:hidden',
                fitHeight === null && 'lg:hidden',
              )}
            >
              <Button size="sm" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
                {expanded ? 'Mostrar menos' : `Ver tudo (${data!.length})`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
