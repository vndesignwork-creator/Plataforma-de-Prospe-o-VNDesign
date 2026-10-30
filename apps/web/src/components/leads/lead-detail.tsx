'use client';

import {
  LEAD_STATUS_META,
  LOST_REASON_LABELS,
  LEAD_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  isSocialUrl,
  serviceLabel,
  STALLED_STATUSES,
  todayIso,
  type Lead,
  type LeadStatus,
  type LostReason,
  leadPath,
  arrangeCards,
  buildVCard,
  vCardFileName,
  isCardHidden,
  type LeadCard,
} from '@vndesign/core';
import {
  Archive,
  ArchiveRestore,
  BellRing,
  CalendarClock,
  Edit3,
  ExternalLink,
  FileText,
  GitMerge,
  Globe,
  History,
  ListChecks,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Phone,
  Plus,
  UserPlus,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { CollapseButton, setCollapsedKeys, useProspectingCollapsed } from '@/components/ui/collapse';
import { DateMenu } from '@/components/ui/date-menu';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import {
  bulkResultMessage,
  useAudits,
  useBulkLeadAction,
  useInvalidateLead,
  useLead,
  useLeads,
  useLeadTasks,
  useMe,
  useReschedule,
  useSettings,
  useTeamNames,
  useUpdateLead,
} from '@/lib/queries';
import { cn, displayHost, telUrl, whatsappUrl } from '@/lib/utils';
import { FollowUpActions } from '@/components/follow-up/follow-up-actions';
import { ActivityTimeline } from './activity-timeline';
import { ChannelLabel, MobileLabel, PageSpeedScore } from './badges';
import { SiteAuditPanel } from './site-audit';
import { AiVisibilityCard } from './ai-visibility';
import { GeoKitCard } from './geo-kit';
import { ContactCard } from './contact-card';
import { LeadLocation } from './lead-location';
import { ProposalsCard } from '@/components/proposals/proposals-card';
import { ContactFinder } from './contact-finder';
import { TasksCard } from '@/components/tasks/tasks-card';
import { NotesCard } from './notes-card';
import { rememberLead } from '@/lib/recent-leads';
import { TagChips, TagEditor } from './tags';
import { CustomFieldsRows } from './custom-fields';
import { LostReasonDialog, LostReasonField } from './lost-reason';
import { StageAge } from './stage-age';
import { LeadFilesCard } from './lead-files';
import { LeadPager } from './lead-pager';
import { CardLayoutButton, LEAD_BOARD, useCardLayout } from './card-layout';
import { LeadSummaryButton } from './lead-summary';
import { PinnedNoteBox, PinnedNoteDialog } from './pinned-note';
import { restoreDeletedLeads } from './trash-view';
import { SectorIconView, StatusIcon } from '@/components/icons/lead-icons';
import { ServiceChips, useServiceCatalog } from '@/components/services/services';
import { FollowUpEmailButton, SendEmailButton } from '@/components/email/send-email-dialog';
import { LeadScoreDetails } from '@/components/leads/lead-score';
import { WhatsAppMenu } from '@/components/leads/whatsapp-menu';
import { MeetingsCard } from '@/components/meetings/meetings-card';
import { PaymentsCard } from '@/components/projects/payments-card';
import { ContractsCard } from '@/components/projects/contracts-card';
import { BrandKitCard } from '@/components/projects/brand-kit-card';
import { ClientProjectsCard } from '@/components/projects/client-projects-card';
import { ProjectCard } from '@/components/projects/project-card';
import { ProjectToggle } from '@/components/projects/project-toggle';

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] md:grid-cols-[8.5rem_minmax(0,1fr)]', className)}>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const dash = <span className="text-muted">—</span>;

function ExternalUrl({ url }: { url: string | null }) {
  if (!url) return dash;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={url}
      className="inline-flex max-w-full min-w-0 items-center gap-1 align-bottom text-accent-text hover:underline"
    >
      {/* Links compridos ficam cortados com "…" dentro da coluna (o endereço completo aparece ao passar o rato). */}
      <span className="min-w-0 truncate">{displayHost(url)}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(abre num novo separador)</span>
    </a>
  );
}

/** Atalhos para contactar o lead (no telemóvel: ligar ou abrir o WhatsApp com um toque). */
/** Descarrega o contacto (.vcf): no telemóvel abre "Adicionar aos contactos". */
function saveContact(lead: Lead) {
  const blob = new Blob([buildVCard(lead)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = vCardFileName(lead.company_name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function QuickContact({ lead, whatsappMessages }: { lead: Lead; whatsappMessages: boolean }) {
  const whatsapp = whatsappUrl(lead.phone);
  const links = [
    lead.phone ? { key: 'tel', href: telUrl(lead.phone), label: 'Ligar', icon: Phone, external: false } : null,
    whatsapp ? { key: 'wa', href: whatsapp, label: 'WhatsApp', icon: MessageCircle, external: true } : null,
    lead.email ? { key: 'email', href: `mailto:${lead.email}`, label: 'Email', icon: Mail, external: false } : null,
    lead.website ? { key: 'site', href: lead.website, label: 'Site', icon: Globe, external: true } : null,
  ].filter((l) => l !== null);
  const classes = buttonClasses('outline', 'sm', 'w-full justify-center whitespace-nowrap pointer-coarse:min-h-11');
  return (
    <nav aria-label="Contactar" className="mb-5 -mt-2">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 sm:flex sm:flex-wrap">
        {links.map(({ key, href, label, icon: Icon, external }) => (
          <li key={key}>
            {/* WhatsApp com mensagens prontas (desliga-se em Definições → Funcionalidades). */}
            {key === 'wa' && whatsappMessages ? (
              <WhatsAppMenu lead={lead} className={classes} />
            ) : key === 'email' ? (
              // Email: vai ao cartão "Contactar" (o email pronto a rever e enviar); sem ele, abre o programa de email.
              <a
                href={href}
                onClick={(e) => {
                  const card = document.getElementById('contactar');
                  if (!card) return;
                  e.preventDefault();
                  setCollapsedKeys([lead.status === 'cliente' ? 'contactar:cliente' : 'contactar'], false);
                  requestAnimationFrame(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    card.querySelector<HTMLElement>('#script-subject, #script-template')?.focus({ preventScroll: true });
                  });
                }}
                className={classes}
              >
                <Icon className="h-4 w-4 text-accent-text" aria-hidden />
                {label}
              </a>
            ) : (
              <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className={classes}>
                <Icon className="h-4 w-4 text-accent-text" aria-hidden />
                {label}
                {external ? <span className="sr-only">(abre num novo separador)</span> : null}
              </a>
            )}
          </li>
        ))}
        {/* Antes de contactar: o resumo da ficha feito pela IA. */}
        <li>
          <LeadSummaryButton lead={lead} className={classes} />
        </li>
        {/* Guardar no telemóvel: o WhatsApp e as chamadas passam a mostrar o nome. */}
        {lead.phone || lead.email ? (
          <li>
            <button type="button" onClick={() => saveContact(lead)} className={classes} title="Guarda a empresa, o contacto, o telefone e o email nos contactos do telemóvel ou do computador">
              <UserPlus className="h-4 w-4 text-accent-text" aria-hidden />
              {/* Telemóvel: "Guardar" (o botão fica numa linha). */}
              <span className="sm:hidden">Guardar</span>
              <span className="hidden sm:inline">Guardar contacto</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "hoje", "amanhã", "daqui a 3 dias", "há 2 dias". */
function relativeDay(due: string, today: string): string {
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  return days > 0 ? `daqui a ${days} dias` : `há ${-days} dias`;
}

/** Faixa no topo da ficha: o próximo passo, quando é, e Feito / Follow-up ▾ / Enviar follow-up ali mesmo. */
function NextStepBar({ lead }: { lead: Lead }) {
  const reschedule = useReschedule();
  const invalidate = useInvalidateLead();
  if (lead.anonymized_at) return null;
  const today = todayIso();
  if (!lead.next_action_on && !lead.next_action_text) {
    // Em conversa sem próximo passo: fica esquecido (o mesmo aviso do "Hoje").
    if (!(STALLED_STATUSES as readonly string[]).includes(lead.status)) return null;
    return (
      <section aria-label="Próximo passo" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/50 px-4 py-3">
        <CalendarClock className="h-5 w-5 shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 flex-1 basis-56 text-sm">
          <span className="font-medium text-warning">Sem próximo passo.</span>{' '}
          <span className="text-muted">Está em conversa: marca o follow-up para não ficar esquecido.</span>
        </p>
        <DateMenu
          today={today}
          heading="Marcar o follow-up para"
          triggerClassName={buttonClasses('outline', 'sm')}
          label={
            <>
              <BellRing className="h-3.5 w-3.5" aria-hidden /> Marcar follow-up
            </>
          }
          onPick={(date) => {
            if (!date) return;
            reschedule.mutate(
              { leads: [{ id: lead.id, next_action_on: date }] },
              {
                onSuccess: () => {
                  invalidate(lead.id);
                  toast.success(`Follow-up marcado para ${formatDate(date)}.`);
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            );
          }}
        />
      </section>
    );
  }
  const due = lead.next_action_on;
  const overdue = due !== null && due < today;
  return (
    <section
      aria-label="Próximo passo"
      className={cn(
        'mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3',
        overdue ? 'border-danger/40 bg-danger-soft' : 'border-border bg-surface',
      )}
    >
      <CalendarClock className={cn('h-5 w-5 shrink-0', overdue ? 'text-danger' : 'text-accent-text')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">Próximo passo</p>
        <p className={cn('text-sm font-medium', overdue && 'text-danger')}>
          {lead.next_action_text ?? 'Ação'}
          {due ? ` · ${WEEKDAYS[new Date(`${due}T12:00:00Z`).getUTCDay()]} ${formatDate(due)}` : ''}
          {due ? <span className={cn('font-normal', overdue ? 'text-danger' : 'text-muted')}> ({overdue ? `em atraso, ${relativeDay(due, today)}` : relativeDay(due, today)})</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FollowUpEmailButton lead={lead} />
        <FollowUpActions lead={lead} quickDone />
      </div>
    </section>
  );
}

/** Campos em falta: atalhos para os acrescentar (na edição do lead). */
function MissingFields({ lead, items }: { lead: Lead; items: { label: string; important?: boolean; hint?: string }[] }) {
  if (!items.length || lead.anonymized_at) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
      <span className="text-xs text-muted">Falta:</span>
      {items.map((i) => (
        <Link
          key={i.label}
          href={leadPath(lead, '/editar')}
          title={i.hint}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs hover:border-accent hover:text-fg pointer-coarse:py-1.5',
            i.important ? 'border-warning/50 bg-warning-soft text-warning' : 'border-border text-muted',
          )}
        >
          <Plus className="h-3 w-3" aria-hidden /> {i.label}
        </Link>
      ))}
    </div>
  );
}

const SITE_TABS = [
  { id: 'diagnostico', label: 'Diagnóstico' },
  { id: 'ias', label: 'Aparece nas IAs' },
  { id: 'geo', label: 'Kit GEO' },
] as const;
type SiteTab = (typeof SITE_TABS)[number]['id'];
const SITE_TAB_KEY = 'vnd.ficha.site';

/** Site e presença online: diagnóstico, "Aparece nas IAs?" e Kit GEO, um de cada vez (o separador fica lembrado). */
function SitePresence({ lead }: { lead: Lead }) {
  const [tab, setTab] = useState<SiteTab>('diagnostico');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SITE_TAB_KEY) as SiteTab | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só depois de montar (localStorage)
      if (saved && SITE_TABS.some((t) => t.id === saved)) setTab(saved);
    } catch {
      // sem localStorage: começa no Diagnóstico
    }
  }, []);
  function choose(next: SiteTab) {
    setTab(next);
    try {
      localStorage.setItem(SITE_TAB_KEY, next);
    } catch {
      // ignora
    }
  }
  if (lead.anonymized_at) return <SiteDiagnosisCard lead={lead} />;
  return (
    <section aria-labelledby="site-presenca" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="site-presenca" className="text-xs font-medium tracking-wide text-muted uppercase">
          Site e presença online
        </h2>
        <div role="tablist" aria-label="Site e presença online" className="inline-flex h-9 max-w-full items-center overflow-x-auto rounded-lg border border-border-input bg-surface-2 p-0.5 [scrollbar-width:none]">
          {SITE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => choose(t.id)}
              className={cn('inline-flex h-full shrink-0 items-center rounded-md px-3 text-sm whitespace-nowrap', tab === t.id ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'diagnostico' ? <SiteDiagnosisCard lead={lead} /> : tab === 'ias' ? <AiVisibilityCard lead={lead} /> : <GeoKitCard lead={lead} />}
    </section>
  );
}

/** Quem trata do lead: o dono/administrador escolhe; o prospetor só vê. */
function AssignedField({ lead, staff, myId }: { lead: Lead; staff: boolean; myId?: string }) {
  const { data: team } = useTeamNames();
  const update = useUpdateLead(lead.id);
  const current = lead.assigned_to ?? null;
  const name = (id: string) => (id === myId ? 'Tu' : team?.find((m) => m.user_id === id)?.name ?? 'Membro da equipa');
  if (!staff || !team || team.length < 2) return current ? <span>{name(current)}</span> : dash;
  return (
    <Select
      aria-label="Responsável"
      value={current ?? ''}
      disabled={update.isPending || Boolean(lead.anonymized_at)}
      className="h-8 w-full max-w-60 text-sm"
      onChange={async (e) => {
        const value = e.target.value || null;
        try {
          await update.mutateAsync({ assigned_to: value });
          toast.success(value ? `Responsável: ${name(value)}.` : 'Sem responsável.');
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }}
    >
      <option value="">Sem responsável</option>
      {team.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.user_id === myId ? `${m.name} (tu)` : m.name}
        </option>
      ))}
    </Select>
  );
}

export function LeadDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: lead, isLoading, error } = useLead(id);
  const { data: me } = useMe();
  const { data: settings } = useSettings();
  // Coluna principal: no computador, a linha do tempo (coluna lateral) não passa do fim dela.
  const mainColumn = useRef<HTMLDivElement>(null);
  const { data: tasks } = useLeadTasks(id);
  const update = useUpdateLead(id);
  const bulk = useBulkLeadAction();
  const invalidate = useInvalidateLead();
  const [dialog, setDialog] = useState<null | 'delete' | 'anonymize' | 'merge'>(null);
  const [pinOpen, setPinOpen] = useState(false);
  // Pesquisa rápida: os leads abertos há pouco aparecem sem escrever nada.
  useEffect(() => {
    if (lead && !lead.anonymized_at) rememberLead(lead);
  }, [lead]);
  // Prospetor: só a parte comercial (sem valores, propostas, pagamentos, projetos nem apagar).
  const staff = me ? me.role !== 'prospector' : false;
  // "Sem interesse": pergunta primeiro o motivo.
  const [askLost, setAskLost] = useState(false);
  const cardLayout = useCardLayout();
  const catalog = useServiceCatalog();
  const { data: team } = useTeamNames();
  const [showEmpty, setShowEmpty] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !lead) {
    return (
      <EmptyState title={error instanceof ApiClientError && error.status === 404 ? 'Lead não encontrado' : 'Não foi possível abrir o lead'}>
        <Link href="/leads" className={buttonClasses('outline')}>
          Voltar aos leads
        </Link>
      </EmptyState>
    );
  }

  async function changeStatus(status: LeadStatus, lostReason?: LostReason | null, retryOn?: string | null) {
    if (status === 'sem_interesse' && lostReason === undefined) {
      setAskLost(true);
      return;
    }
    setAskLost(false);
    try {
      const updated = await update.mutateAsync(status === 'sem_interesse' ? { status, lost_reason: lostReason ?? null, retry_on: retryOn ?? null } : { status });
      const scheduled =
        status === 'contactado' && updated.next_action_on && updated.next_action_on !== lead!.next_action_on;
      toast.success(
        scheduled
          ? `Estado: ${LEAD_STATUS_META[status].label}. Follow-up agendado para ${formatDate(updated.next_action_on)}.`
          : status === 'cliente'
            ? settings?.features.projects && settings.features.project_kickoff
              ? 'Novo cliente! 🎉 O projeto ficou preparado: tarefas, prazo e pagamentos.'
              : 'Novo cliente! 🎉 Organiza o projeto nas tarefas.'
            : `Estado: ${LEAD_STATUS_META[status].label}.`,
        status === 'cliente'
          ? { action: { label: 'Ver projeto', onClick: () => document.getElementById(settings?.features.projects ? 'projeto' : 'tarefas')?.scrollIntoView({ behavior: 'smooth' }) } }
          : undefined,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  // Coluna lateral: pela ordem que esta pessoa escolheu (Organizar cartões), sem os que escondeu.
  const sideCards: Partial<Record<LeadCard, ReactNode>> = {
    tasks: !lead.anonymized_at ? <TasksCard lead={lead} /> : null,
    payments: staff && settings?.features.payments ? <PaymentsCard lead={lead} /> : null,
    projects: staff && settings?.features.projects ? <ClientProjectsCard lead={lead} /> : null,
    brand_kit: staff && settings?.features.brand_kit && (lead.status === 'cliente' || lead.client_of) && !lead.anonymized_at ? <BrandKitCard lead={lead} /> : null,
    // Antes de ser cliente: só os ficheiros (os mesmos do kit, que ficam lá quando ganhar).
    files: settings?.features.brand_kit && lead.status !== 'cliente' && !lead.client_of && !lead.anonymized_at ? <LeadFilesCard lead={lead} /> : null,
    meetings: settings?.features.meetings ? <MeetingsCard lead={lead} /> : null,
    notes: <NotesCard lead={lead} />,
    proposals: staff ? <ProposalsCard lead={lead} /> : null,
    contracts: staff && settings?.features.contracts ? <ContractsCard lead={lead} /> : null,
    activity: (
      <div id="atividade" className="scroll-mt-20">
        <ActivityTimeline leadId={lead.id} currentUserId={me?.user.id} fitTo={mainColumn} />
      </div>
    ),
  };
  // Os que existem nesta ficha (escondidos incluídos: em "Organizar cartões" voltam a mostrar-se).
  const availableCards = arrangeCards(cardLayout).filter((key) => sideCards[key]);
  const asideCards = availableCards.filter((key) => !isCardHidden(cardLayout, key)).map((key) => [key, sideCards[key]] as const);

  /** Arquivar/repor, com "Anular" no aviso para desfazer logo. */
  async function setArchived(archived: boolean) {
    const ids = [lead!.id];
    try {
      await bulk.mutateAsync({ action: archived ? 'archive' : 'restore', ids });
      toast.success(archived ? 'Lead arquivado. Já não aparece na lista, no Kanban, no mapa nem em "Hoje".' : 'Lead reposto.', {
        action: {
          label: 'Anular',
          onClick: () =>
            bulk.mutate(
              { action: archived ? 'restore' : 'archive', ids },
              { onSuccess: (r) => toast.success(bulkResultMessage(r)), onError: (e) => toast.error(errorMessage(e)) },
            ),
        },
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Breadcrumbs
              items={[{ label: 'Leads', href: '/leads' }]}
              meta={
                <>
                  #{lead.number}
                  {lead.sector ? (
                    <>
                      {' · '}
                      <span className="inline-flex items-center gap-1 align-[-2px]">
                        <SectorIconView sector={lead.sector} className="h-3.5 w-3.5" />
                        {lead.sector.name}
                      </span>
                    </>
                  ) : null}
                  <span className="ml-2 inline-flex align-middle">
                    <LeadScoreDetails lead={lead} />
                  </span>
                  {lead.client_of ? (
                    <>
                      {' · '}
                      <Link href={`/leads/${lead.client_of}`} className="text-accent-text hover:underline">
                        projeto de um cliente que voltou (ver o cliente)
                      </Link>
                    </>
                  ) : null}
                </>
              }
            />
            {/* Vindo da lista: ← → para o lead anterior/seguinte dessa lista. */}
            <LeadPager lead={lead} className="-my-1" />
          </div>
        }
        description={(() => {
          // De relance: cidade · serviços · valor · responsável.
          const owner = (team?.length ?? 0) > 1 ? (lead.assigned_to ? team?.find((m) => m.user_id === lead.assigned_to)?.name : 'Sem responsável') : null;
          const parts = [
            lead.city,
            lead.services?.length ? lead.services.map((k) => serviceLabel(k, catalog.all)).join(', ') : null,
            staff && lead.estimated_value ? formatCurrency(lead.estimated_value, { decimals: false }) : null,
            owner,
          ].filter(Boolean);
          return parts.length && !lead.anonymized_at ? parts.join(' · ') : undefined;
        })()}
        title={
          lead.project_title ? (
            <>
              {lead.company_name} <span className="text-muted">· {lead.project_title}</span>
            </>
          ) : (
            lead.company_name
          )
        }
        // Telemóvel/tablet: grelha de 2 colunas sem buracos (Estado | Editar ⋯ / Tarefas | Linha do tempo);
        // no computador volta a ser uma fila de botões.
        actionsClassName="grid w-full grid-cols-2 lg:flex lg:w-auto"
        actions={
          <>
            <span className="relative inline-flex min-w-0">
              <label className="sr-only" htmlFor="lead-status">
                Estado
              </label>
              <StatusIcon status={lead.status} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <Select
                id="lead-status"
                value={lead.status}
                onChange={(e) => changeStatus(e.target.value as LeadStatus)}
                disabled={update.isPending || Boolean(lead.anonymized_at)}
                className="w-full pl-9 font-medium lg:w-auto"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </span>
            <div className="flex min-w-0 gap-2 lg:contents">
              {!lead.anonymized_at ? (
                <Link href={leadPath(lead, '/editar')} className={buttonClasses('outline', 'md', 'min-w-0 flex-1 max-lg:px-3')}>
                  <Edit3 className="h-4 w-4" aria-hidden />
                  Editar
                </Link>
              ) : null}
              {/* No telemóvel, Arquivar/Repor fica no menu "⋯" para a grelha não ter buracos. */}
              {lead.archived_at ? (
                <Button variant="outline" className="max-lg:hidden" onClick={() => void setArchived(false)} loading={bulk.isPending}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden />
                  Repor
                </Button>
              ) : (
                <Button variant="outline" className="max-lg:hidden" onClick={() => void setArchived(true)} loading={bulk.isPending}>
                  <Archive className="h-4 w-4" aria-hidden />
                  Arquivar
                </Button>
              )}
              <DropdownRoot>
                <DropdownTrigger className={buttonClasses('outline', 'icon', 'h-10 w-10 shrink-0')} aria-label="Mais ações">
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </DropdownTrigger>
                <DropdownContent>
                  {!lead.anonymized_at ? (
                    <DropdownItem onSelect={() => setPinOpen(true)}>
                      <Pin className="h-4 w-4" aria-hidden /> {lead.pinned_note ? 'Editar a nota afixada…' : 'Afixar uma nota…'}
                    </DropdownItem>
                  ) : null}
                  <DropdownItem className="lg:hidden" onSelect={() => void setArchived(!lead.archived_at)}>
                    {lead.archived_at ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                    {lead.archived_at ? 'Repor' : 'Arquivar'}
                  </DropdownItem>
                  {staff ? (
                    <>
                      <DropdownItem onSelect={() => setDialog('merge')} disabled={Boolean(lead.anonymized_at)}>
                        <GitMerge className="h-4 w-4" aria-hidden /> Juntar com outro lead…
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem onSelect={() => setDialog('anonymize')} disabled={Boolean(lead.anonymized_at)}>
                        <ShieldOff className="h-4 w-4" aria-hidden /> Anonimizar (RGPD)…
                      </DropdownItem>
                      <DropdownItem onSelect={() => setDialog('delete')} danger>
                        <Trash2 className="h-4 w-4" aria-hidden /> Apagar lead…
                      </DropdownItem>
                    </>
                  ) : null}
                </DropdownContent>
              </DropdownRoot>
            </div>
            {/* Telemóvel/tablet: tarefas e linha do tempo ficam no fim da página. */}
            {!lead.anonymized_at ? (
              <a href="#tarefas" className={buttonClasses('outline', 'md', 'min-w-0 px-3 lg:hidden')}>
                <ListChecks className="h-4 w-4" aria-hidden />
                Tarefas
                {tasks?.length ? (
                  <span className="text-xs text-muted tabular">
                    {tasks.filter((t) => t.done_at).length}/{tasks.length}
                  </span>
                ) : null}
              </a>
            ) : null}
            <a href="#atividade" className={buttonClasses('outline', 'md', 'min-w-0 px-3 lg:hidden')}>
              <History className="h-4 w-4" aria-hidden />
              Linha do tempo
            </a>
          </>
        }
      />

      {!lead.anonymized_at ? <PinnedNoteBox note={lead.pinned_note} onEdit={() => setPinOpen(true)} className="mb-3 -mt-2" /> : null}
      {!lead.anonymized_at ? <QuickContact lead={lead} whatsappMessages={!!settings?.features.whatsapp_templates} /> : null}
      <NextStepBar lead={lead} />
      {!lead.anonymized_at ? <PinnedNoteDialog lead={lead} open={pinOpen} onOpenChange={setPinOpen} /> : null}
      {askLost ? (
        <LostReasonDialog
          open
          subject={`#${lead.number} ${lead.company_name}`}
          onPick={(reason, retryOn) => void changeStatus('sem_interesse', reason, retryOn)}
          onCancel={() => setAskLost(false)}
        />
      ) : null}

      {lead.archived_at ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <p className="flex items-start gap-2">
            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="font-medium">Arquivado em {formatDateTime(lead.archived_at)}.</span>{' '}
              <span className="text-muted">Não aparece na lista, no Kanban, no mapa nem em &quot;Hoje&quot;; o histórico mantém-se.</span>
            </span>
          </p>
        </div>
      ) : null}

      {lead.anonymized_at ? (
        <p role="status" className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          Lead anonimizado em {formatDateTime(lead.anonymized_at)}. Os dados de contacto foram apagados; mantêm-se só os dados
          estatísticos.
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div ref={mainColumn} className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="Negócio"
              actions={staff && lead.status === 'cliente' && settings?.features.projects && !lead.anonymized_at ? <ProjectToggle lead={lead} /> : undefined}
            />
            <dl className="grid px-4 py-2 md:grid-cols-2 md:gap-x-6">
              <Row label="Serviços" className="md:col-span-2">
                {lead.services?.length ? (
                  <ServiceChips services={lead.services} />
                ) : !lead.anonymized_at ? (
                  <Link href={leadPath(lead, '/editar')} className="text-accent-text hover:underline">
                    Escolher serviços de interesse
                  </Link>
                ) : (
                  dash
                )}
              </Row>
              <Row label="Etiquetas" className="md:col-span-2">
                {!lead.anonymized_at ? <TagEditor lead={lead} /> : lead.tags?.length ? <TagChips tags={lead.tags} /> : dash}
              </Row>
              <CustomFieldsRows lead={lead} canEdit={!lead.anonymized_at} />
              {lead.status === 'sem_interesse' ? (
                <Row label="Motivo" className="md:col-span-2">
                  {!lead.anonymized_at ? <LostReasonField lead={lead} /> : lead.lost_reason ? LOST_REASON_LABELS[lead.lost_reason] : dash}
                </Row>
              ) : null}
              {!['cliente', 'sem_interesse'].includes(lead.status) ? (
                <Row label="Nesta fase">
                  <StageAge since={lead.status_changed_at} />
                </Row>
              ) : null}
              <Row label="Responsável">
                <AssignedField lead={lead} staff={staff} myId={me?.user.id} />
              </Row>
              {/* Os campos vazios ficam recolhidos ("Mostrar campos vazios"). */}
              {(() => {
                const rows: { key: string; label: string; value: ReactNode; wide?: boolean; filled: boolean }[] = [
                  {
                    key: 'angle',
                    label: 'Ângulo de abordagem',
                    wide: true,
                    filled: !!lead.approach_angle,
                    value: <span className="whitespace-pre-line">{lead.approach_angle}</span>,
                  },
                  // Com próximo passo, ele está na faixa do topo.
                  ...(lead.next_action_text || lead.next_action_on ? [] : [{ key: 'next', label: 'Próxima ação', filled: false, value: dash }]),
                  ...(staff ? [{ key: 'value', label: 'Valor estimado', filled: !!lead.estimated_value, value: formatCurrency(lead.estimated_value) }] : []),
                  { key: 'channel', label: 'Canal', filled: !!lead.channel, value: <ChannelLabel channel={lead.channel} /> },
                  { key: 'first', label: '1.º contacto', filled: !!lead.first_contact_on, value: formatDate(lead.first_contact_on) },
                  { key: 'last', label: 'Último follow-up', filled: !!lead.last_follow_up_on, value: formatDate(lead.last_follow_up_on) },
                  { key: 'suggested', label: 'Sugerido em', filled: !!lead.suggested_on, value: formatDate(lead.suggested_on) },
                ];
                const empty = rows.filter((r) => !r.filled).length;
                return (
                  <>
                    {rows
                      .filter((r) => r.filled || showEmpty)
                      .map((r) => (
                        <Row key={r.key} label={r.label} className={r.wide ? 'md:col-span-2' : undefined}>
                          {r.filled ? r.value : dash}
                        </Row>
                      ))}
                    {empty ? (
                      <div className="md:col-span-2">
                        <button type="button" onClick={() => setShowEmpty(!showEmpty)} aria-expanded={showEmpty} className="py-1.5 text-xs text-muted hover:text-fg hover:underline">
                          {showEmpty ? 'Esconder campos vazios' : `Mostrar campos vazios (${empty})`}
                        </button>
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </dl>
          </Card>

          {/* Cliente: o projeto logo a seguir ao pipeline, na coluna larga. */}
          {staff && lead.status === 'cliente' && settings?.features.projects && !lead.anonymized_at ? <ProjectCard lead={lead} /> : null}

          {/* Contactar: a ação principal num lead, logo a seguir ao negócio (o botão "Email" do topo traz aqui). */}
          <ContactCard lead={lead} />

          <Card>
            <CardHeader title="Empresa e contacto" />
            <dl className="grid px-4 py-2 md:grid-cols-2 md:gap-x-6">
              {lead.website ? (
                <Row label="Website">
                  <ExternalUrl url={lead.website} />
                  {isSocialUrl(lead.website) ? <span className="ml-2 text-xs text-muted">(rede social — sem site próprio)</span> : null}
                </Row>
              ) : null}
              {lead.city ? <Row label="Cidade">{lead.city}</Row> : null}
              {lead.address ? (
                <Row label="Morada" className="md:col-span-2">
                  {lead.address}
                </Row>
              ) : null}
              <Row label="Mapa">
                <LeadLocation lead={lead} />
              </Row>
              {lead.contact_name ? <Row label="Contacto">{lead.contact_name}</Row> : null}
              {lead.email ? (
                <Row label="Email">
                  <span className="flex flex-col gap-0.5">
                    <a href={`mailto:${lead.email}`} className={cn('text-accent-text hover:underline', lead.email_bounced_at && 'line-through opacity-70')}>
                      {lead.email}
                    </a>
                    {/* O último email foi devolvido: o endereço não existe (limpa-se ao mudar o email). */}
                    {lead.email_bounced_at ? (
                      <span className="text-xs font-medium text-danger">
                        Email devolvido a {formatDate(lead.email_bounced_at.slice(0, 10))}: procura outro email ou liga.
                      </span>
                    ) : null}
                  </span>
                </Row>
              ) : null}
              {lead.phone ? (
                <Row label="Telefone">
                  <a href={telUrl(lead.phone)} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {lead.phone}
                  </a>
                </Row>
              ) : null}
              {lead.source_url ? (
                <Row label="Fonte">
                  <ExternalUrl url={lead.source_url} />
                </Row>
              ) : null}
            </dl>
            {/* O que falta: a pessoa de contacto salta à vista (os emails e scripts usam o nome). */}
            <MissingFields
              lead={lead}
              items={[
                ...(lead.contact_name ? [] : [{ label: 'Pessoa de contacto', important: true, hint: 'Os emails e scripts começam pelo nome da pessoa' }]),
                ...(lead.website ? [] : [{ label: 'Website' }]),
                ...(lead.city ? [] : [{ label: 'Cidade' }]),
                ...(lead.source_url ? [] : [{ label: 'Fonte' }]),
              ]}
            />
            {(!lead.phone || !lead.email || lead.email_bounced_at) && !lead.anonymized_at ? (
              <div className="px-4 pb-4">
                <ContactFinder key={lead.updated_at} lead={lead} />
              </div>
            ) : null}
          </Card>

          <SitePresence lead={lead} />

          <p className="text-xs text-muted">
            Criado em {formatDateTime(lead.created_at)} · atualizado em {formatDateTime(lead.updated_at)}
          </p>
        </div>

        {/* Coluna lateral (computador): o que se consulta durante uma chamada — notas, propostas e atividade. */}
        <aside aria-label="Tarefas, pagamentos, notas, propostas e atividade" className="flex flex-col gap-5">
          {asideCards.map(([key, node]) => (
            <Fragment key={key}>{node}</Fragment>
          ))}
          <CardLayoutButton board={LEAD_BOARD} available={availableCards} />
        </aside>
      </div>

      <DeleteDialog
        lead={lead}
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        onDone={() => {
          invalidate();
          router.push('/leads');
        }}
      />
      <AnonymizeDialog
        lead={lead}
        open={dialog === 'anonymize'}
        onOpenChange={(o) => setDialog(o ? 'anonymize' : null)}
        onDone={() => invalidate(lead.id)}
      />
      <MergePickerDialog lead={lead} open={dialog === 'merge'} onOpenChange={(o) => setDialog(o ? 'merge' : null)} />
    </>
  );
}

function DeleteDialog({
  lead,
  open,
  onOpenChange,
  onDone,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [dnc, setDnc] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function confirm() {
    setBusy(true);
    try {
      await api(`/leads/${lead.id}`, { method: 'DELETE', query: { add_to_do_not_contact: dnc || undefined } });
      // Sem "não contactar" vai para a reciclagem: dá para anular (ou repor em Leads → Apagados).
      toast.success(dnc ? `Lead #${lead.number} apagado de vez.` : `Lead #${lead.number} apagado (fica 30 dias em Apagados).`, {
        action: dnc
          ? undefined
          : {
              label: 'Anular',
              onClick: () =>
                void restoreDeletedLeads([lead.id]).then(
                  () => {
                    toast.success(`#${lead.number} reposto.`);
                    router.push(`/leads/${lead.id}`);
                    router.refresh();
                  },
                  (e: unknown) => toast.error(errorMessage(e)),
                ),
            },
      });
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Apagar #${lead.number}?`}
      description={
        dnc
          ? 'Pedido RGPD: o lead e tudo o que tem são apagados de vez. Não é possível desfazer.'
          : 'O lead vai para Leads → Apagados, com tudo o que tem (tarefas, pagamentos, reuniões, linha do tempo). Durante 30 dias podes repô-lo; depois sai de vez.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            {dnc ? 'Apagar de vez' : 'Apagar'}
          </Button>
        </>
      }
    >
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={dnc} onChange={(e) => setDnc(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
        <span>
          Acrescentar à lista &ldquo;não contactar&rdquo;
          <span className="block text-muted">Bloqueia novas importações desta empresa (guarda só nome, website e email).</span>
        </span>
      </label>
    </Dialog>
  );
}

function AnonymizeDialog({
  lead,
  open,
  onOpenChange,
  onDone,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [dnc, setDnc] = useState(true);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      await api(`/leads/${lead.id}/anonymize`, { method: 'POST', body: { add_to_do_not_contact: dnc } });
      toast.success('Lead anonimizado.');
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Anonimizar lead?"
      description="Apaga nome, website, morada, contactos, notas, emails e as notas da linha do tempo. Mantém setor, cidade, estado e valor para as estatísticas."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            Anonimizar
          </Button>
        </>
      }
    >
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={dnc} onChange={(e) => setDnc(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
        <span>
          Acrescentar à lista &ldquo;não contactar&rdquo;
          <span className="block text-muted">Recomendado quando a empresa pediu para não ser contactada.</span>
        </span>
      </label>
    </Dialog>
  );
}

function MergePickerDialog({ lead, open, onOpenChange }: { lead: Lead; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const { data, isFetching } = useLeads({ q: q || undefined, limit: 8, sort: 'company_name', order: 'asc' });
  const results = (data?.data ?? []).filter((l) => l.id !== lead.id);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Juntar outro lead a #${lead.number}`}
      description={`O lead escolhido é apagado e a sua linha do tempo passa para "${lead.company_name}". No passo seguinte escolhes que valores ficam.`}
    >
      <label htmlFor="merge-search" className="text-sm font-medium">
        Procurar lead
      </label>
      <Input
        id="merge-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Nome, email, website…"
        className="mt-1.5"
        autoFocus
      />
      <ul className="mt-3 flex flex-col gap-1" aria-busy={isFetching}>
        {results.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => router.push(`${leadPath(lead, '/juntar')}?com=${l.id}`)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              <span>
                <span className="mr-1 text-muted tabular">#{l.number}</span>
                <span className="font-medium">{l.company_name}</span>
                {l.city ? <span className="text-muted"> · {l.city}</span> : null}
              </span>
              <GitMerge className="h-4 w-4 text-muted" aria-hidden />
            </button>
          </li>
        ))}
        {!isFetching && results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Sem resultados.</li> : null}
      </ul>
    </Dialog>
  );
}

/**
 * Diagnóstico do site. Aberto se o lead tem algum serviço de Web Design ou ainda não
 * tem serviços; com só outras categorias fica recolhido numa linha (pode abrir-se).
 */
/** Relatório de diagnóstico em PDF: ver e enviar ao cliente (com a análise do site feita). */
function DiagnosisReportActions({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const { data: audits } = useAudits(lead.id);
  if (!settings?.features.diagnosis_report || lead.anonymized_at || !audits?.some((a) => a.status === 'done')) return null;
  return (
    <>
      <a href={`/api/v1/leads/${lead.id}/diagnosis-pdf`} target="_blank" rel="noopener" className={buttonClasses('outline', 'sm')}>
        <FileText className="h-3.5 w-3.5" aria-hidden />
        Relatório PDF
      </a>
      <SendEmailButton
        lead={lead}
        label="Enviar relatório"
        variant="outline"
        attachDiagnosis
        template="Relatório de diagnóstico"
        subject={`Diagnóstico do site da ${lead.company_name}`}
        body={
          `${lead.contact_name ? `Olá ${lead.contact_name},` : 'Boa tarde,'}\n\n` +
          'Fiz uma análise rápida ao vosso site e preparei um pequeno relatório (em anexo) com os pontos que mais afastam clientes e como os resolveria.\n\n' +
          'Se fizer sentido, posso explicar-lhe em 15 minutos, sem compromisso.\n\nCumprimentos,'
        }
      />
    </>
  );
}

function SiteDiagnosisCard({ lead }: { lead: Lead }) {
  const catalog = useServiceCatalog();
  const services = lead.services ?? [];
  const relevant = !services.length || services.some((s) => catalog.get(s)?.category === 'web');
  // Recolher fica lembrado (para todos os leads); sem serviços de site começa recolhido, só nesta ficha.
  const [stored, setStored] = useProspectingCollapsed('diagnostico', lead.status);
  const [shown, setShown] = useState(false);
  const collapsed = relevant ? stored : !shown;
  const open = !collapsed;
  const summary = [
    lead.pagespeed !== null ? `PageSpeed ${lead.pagespeed}` : null,
    lead.mobile === 'sim' ? 'Adaptado a telemóvel' : lead.mobile === 'nao' ? 'Não adaptado a telemóvel' : null,
    lead.problems?.replace(/\s+/g, ' ') ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <CardHeader
        title="Diagnóstico do site"
        description={
          !relevant ? 'Não é relevante para os serviços escolhidos.' : collapsed && summary ? <span className="line-clamp-1">{summary}</span> : undefined
        }
        actions={
          <>
            {relevant ? <DiagnosisReportActions lead={lead} /> : null}
            <CollapseButton collapsed={collapsed} onToggle={() => (relevant ? setStored(!collapsed) : setShown(!shown))} label="Diagnóstico do site" />
          </>
        }
        className={open ? undefined : 'border-b-0'}
      />
      {open ? (
        <>
          {/* Cada linha (<div> com <dt>/<dd>) é filha direta do <dl>, como pede o HTML. */}
          <dl className="grid px-4 py-2 md:grid-cols-2 md:gap-x-6">
            <Row label="PageSpeed (mobile)">
              <PageSpeedScore value={lead.pagespeed} />
            </Row>
            <Row label="Mobile?">
              <MobileLabel mobile={lead.mobile} />
            </Row>
            <Row label="Problemas" className="md:col-span-2">
              {lead.problems ? <span className="whitespace-pre-line">{lead.problems}</span> : dash}
            </Row>
          </dl>
          <SiteAuditPanel lead={lead} />
        </>
      ) : null}
    </Card>
  );
}
