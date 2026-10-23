'use client';

import {
  LEAD_STATUS_META,
  LEAD_STATUSES,
  formatCurrency,
  formatDate,
  formatDateTime,
  isSocialUrl,
  mailtoUrl,
  todayIso,
  type Lead,
  type LeadStatus,
  leadPath,
} from '@vndesign/core';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Copy,
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
  Phone,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
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
  useLogActivity,
  useMe,
  useSettings,
  useTeamNames,
  useUpdateLead,
} from '@/lib/queries';
import { cn, displayHost, telUrl, whatsappUrl } from '@/lib/utils';
import { FollowUpActions } from '@/components/follow-up/follow-up-actions';
import { ContactScriptsCard } from '@/components/scripts/contact-scripts-card';
import { ActivityTimeline } from './activity-timeline';
import { ChannelLabel, MobileLabel, PageSpeedScore } from './badges';
import { SiteAuditPanel } from './site-audit';
import { AiVisibilityCard } from './ai-visibility';
import { AiEmailCard } from './ai-email-card';
import { LeadLocation } from './lead-location';
import { ProposalsCard } from '@/components/proposals/proposals-card';
import { ContactFinder } from './contact-finder';
import { TasksCard } from '@/components/tasks/tasks-card';
import { NotesCard } from './notes-card';
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
    <div className={cn('grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-1.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]', className)}>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const dash = <span className="text-muted">—</span>;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

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
function QuickContact({ lead, whatsappMessages }: { lead: Lead; whatsappMessages: boolean }) {
  const whatsapp = whatsappUrl(lead.phone);
  const links = [
    lead.phone ? { key: 'tel', href: telUrl(lead.phone), label: 'Ligar', icon: Phone, external: false } : null,
    whatsapp ? { key: 'wa', href: whatsapp, label: 'WhatsApp', icon: MessageCircle, external: true } : null,
    lead.email ? { key: 'email', href: `mailto:${lead.email}`, label: 'Email', icon: Mail, external: false } : null,
    lead.website ? { key: 'site', href: lead.website, label: 'Site', icon: Globe, external: true } : null,
  ].filter((l) => l !== null);
  if (!links.length) return null;
  const classes = buttonClasses('outline', 'sm', 'w-full justify-center pointer-coarse:min-h-11');
  return (
    <nav aria-label="Contactar" className="mb-5 -mt-2">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 sm:flex sm:flex-wrap">
        {links.map(({ key, href, label, icon: Icon, external }) => (
          <li key={key}>
            {/* WhatsApp com mensagens prontas (desliga-se em Definições → Funcionalidades). */}
            {key === 'wa' && whatsappMessages ? (
              <WhatsAppMenu lead={lead} className={classes} />
            ) : (
              <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className={classes}>
                <Icon className="h-4 w-4 text-accent-text" aria-hidden />
                {label}
                {external ? <span className="sr-only">(abre num novo separador)</span> : null}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
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
  const log = useLogActivity(id);
  const invalidate = useInvalidateLead();
  const [dialog, setDialog] = useState<null | 'delete' | 'anonymize' | 'merge'>(null);
  // Prospetor: só a parte comercial (sem valores, propostas, pagamentos, projetos nem apagar).
  const staff = me ? me.role !== 'prospector' : false;

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

  const today = todayIso();
  const overdue = lead.next_action_on !== null && lead.next_action_on < today;

  async function changeStatus(status: LeadStatus) {
    try {
      const updated = await update.mutateAsync({ status });
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

  async function copy(part: 'subject' | 'body' | 'all') {
    const text =
      part === 'subject' ? lead!.email_subject ?? '' : part === 'body' ? lead!.email_body ?? '' : `${lead!.email_subject ?? ''}\n\n${lead!.email_body ?? ''}`;
    if (await copyText(text)) {
      toast.success(part === 'subject' ? 'Assunto copiado.' : 'Email copiado.');
      log.mutate({ type: 'email_copied', payload: { part } });
    } else {
      toast.error('Não foi possível copiar. Seleciona o texto e copia manualmente.');
    }
  }

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

  function openMailto() {
    log.mutate({ type: 'email_mailto' });
    if (!lead!.email) toast.info('Este lead não tem email: escreve o destinatário no teu programa de email.');
    window.location.href = mailtoUrl(lead!.email, lead!.email_subject, lead!.email_body);
  }

  return (
    <>
      <PageHeader
        eyebrow={
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
        }
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

      {!lead.anonymized_at ? <QuickContact lead={lead} whatsappMessages={!!settings?.features.whatsapp_templates} /> : null}

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
              title="Pipeline"
              actions={
                <>
                  {staff && lead.status === 'cliente' && settings?.features.projects && !lead.anonymized_at ? <ProjectToggle lead={lead} /> : null}
                  {(lead.next_action_on || lead.next_action_text) && !lead.anonymized_at ? (
                    <>
                      <FollowUpEmailButton lead={lead} />
                      <FollowUpActions lead={lead} />
                    </>
                  ) : null}
                </>
              }
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
              <Row label="Ângulo de abordagem" className="md:col-span-2">
                {lead.approach_angle ? <span className="whitespace-pre-line">{lead.approach_angle}</span> : dash}
              </Row>
              <Row label="Próxima ação">
                {lead.next_action_text || lead.next_action_on ? (
                  <span className={cn(overdue && 'font-medium text-danger')}>
                    {lead.next_action_text ?? 'Ação'}
                    {lead.next_action_on ? ` · ${formatDate(lead.next_action_on)}` : ''}
                    {overdue ? ' (em atraso)' : ''}
                  </span>
                ) : (
                  dash
                )}
              </Row>
              <Row label="Responsável">
                <AssignedField lead={lead} staff={staff} myId={me?.user.id} />
              </Row>
              {staff ? <Row label="Valor estimado">{formatCurrency(lead.estimated_value) || dash}</Row> : null}
              <Row label="Canal">
                <ChannelLabel channel={lead.channel} />
              </Row>
              <Row label="1.º contacto">{formatDate(lead.first_contact_on) || dash}</Row>
              <Row label="Último follow-up">{formatDate(lead.last_follow_up_on) || dash}</Row>
              <Row label="Sugerido em">{formatDate(lead.suggested_on) || dash}</Row>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Empresa e contacto" />
            <dl className="grid px-4 py-2 md:grid-cols-2 md:gap-x-6">
              <Row label="Website">
                <ExternalUrl url={lead.website} />
                {isSocialUrl(lead.website) ? <span className="ml-2 text-xs text-muted">(rede social — sem site próprio)</span> : null}
              </Row>
              <Row label="Cidade">{lead.city ?? dash}</Row>
              <Row label="Morada">{lead.address ?? dash}</Row>
              <Row label="Mapa">
                <LeadLocation lead={lead} />
              </Row>
              <Row label="Contacto">{lead.contact_name ?? dash}</Row>
              <Row label="Email">
                {lead.email ? (
                  <a href={`mailto:${lead.email}`} className="text-accent-text hover:underline">
                    {lead.email}
                  </a>
                ) : (
                  dash
                )}
              </Row>
              <Row label="Telefone">
                {lead.phone ? (
                  <a href={telUrl(lead.phone)} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    {lead.phone}
                  </a>
                ) : (
                  dash
                )}
              </Row>
              <Row label="Fonte">
                <ExternalUrl url={lead.source_url} />
              </Row>
            </dl>
            {(!lead.phone || !lead.email) && !lead.anonymized_at ? (
              <div className="px-4 pb-4">
                <ContactFinder key={lead.updated_at} lead={lead} />
              </div>
            ) : null}
          </Card>

          <SiteDiagnosisCard lead={lead} />

          <AiVisibilityCard lead={lead} />

          {!lead.anonymized_at ? <ContactScriptsCard lead={lead} /> : null}

          <AiEmailCard lead={lead} />

          <Card>
            <CardHeader
              title="Email de prospeção"
              description="Pronto a enviar, copiar ou abrir no teu cliente de email."
              actions={
                <>
                  {!lead.anonymized_at ? (
                    <Link
                      href={leadPath(lead, '/editar')}
                      className={buttonClasses('ghost', 'sm')}
                      aria-label="Editar email de prospeção"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden />
                      Editar
                    </Link>
                  ) : null}
                  {lead.email_body || lead.email_subject ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => copy('all')}>
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Copiar tudo
                      </Button>
                      <Button size="sm" variant="outline" onClick={openMailto}>
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        Abrir no email
                      </Button>
                      <SendEmailButton
                        lead={lead}
                        subject={lead.email_subject ?? ''}
                        body={lead.email_body ?? ''}
                        template="Email de prospeção"
                      />
                    </>
                  ) : null}
                </>
              }
            />
            {lead.email_body || lead.email_subject ? (
              <div className="flex flex-col gap-4 p-4">
                {/* Cada parte tem a sua barra com o botão de copiar, para nunca tapar o texto. */}
                <section aria-label="Assunto do email">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Assunto</h3>
                    {lead.email_subject ? (
                      <Button size="sm" variant="ghost" onClick={() => copy('subject')} aria-label="Copiar assunto">
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Copiar
                      </Button>
                    ) : null}
                  </div>
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium break-words">{lead.email_subject ?? '—'}</p>
                </section>
                <section aria-label="Mensagem do email">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Mensagem</h3>
                    {lead.email_body ? (
                      <Button size="sm" variant="ghost" onClick={() => copy('body')} aria-label="Copiar mensagem">
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Copiar
                      </Button>
                    ) : null}
                  </div>
                  <pre className="max-h-[28rem] overflow-auto rounded-lg bg-surface-2 p-3 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {lead.email_body ?? ''}
                  </pre>
                </section>
              </div>
            ) : (
              <p className="p-4 text-center text-sm text-muted">Ainda não há email de prospeção.</p>
            )}
          </Card>

          <p className="text-xs text-muted">
            Criado em {formatDateTime(lead.created_at)} · atualizado em {formatDateTime(lead.updated_at)}
          </p>
        </div>

        {/* Coluna lateral (computador): o que se consulta durante uma chamada — notas, propostas e atividade. */}
        <aside aria-label="Tarefas, notas, propostas e atividade" className="flex flex-col gap-5">
          {!lead.anonymized_at ? <TasksCard lead={lead} /> : null}
          {staff && lead.status === 'cliente' && settings?.features.projects && !lead.anonymized_at ? <ProjectCard lead={lead} /> : null}
          {staff && settings?.features.projects ? <ClientProjectsCard lead={lead} /> : null}
          {staff && settings?.features.brand_kit && (lead.status === 'cliente' || lead.client_of) && !lead.anonymized_at ? <BrandKitCard lead={lead} /> : null}
          {settings?.features.meetings ? <MeetingsCard lead={lead} /> : null}
          {staff && settings?.features.payments ? <PaymentsCard lead={lead} /> : null}
          <NotesCard lead={lead} />
          {staff ? <ProposalsCard lead={lead} /> : null}
          {staff && settings?.features.contracts ? <ContractsCard lead={lead} /> : null}
          <div id="atividade" className="scroll-mt-20">
            <ActivityTimeline leadId={lead.id} currentUserId={me?.user.id} fitTo={mainColumn} />
          </div>
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
  async function confirm() {
    setBusy(true);
    try {
      await api(`/leads/${lead.id}`, { method: 'DELETE', query: { add_to_do_not_contact: dnc || undefined } });
      toast.success(`Lead #${lead.number} apagado.`);
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
      description="O lead e toda a sua linha do tempo são apagados definitivamente. Não é possível desfazer."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            Apagar definitivamente
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
  const [expanded, setExpanded] = useState(false);
  const services = lead.services ?? [];
  const relevant = !services.length || services.some((s) => catalog.get(s)?.category === 'web');
  const open = relevant || expanded;

  return (
    <Card>
      <CardHeader
        title="Diagnóstico do site"
        description={relevant ? undefined : 'Não é relevante para os serviços escolhidos.'}
        actions={
          relevant ? (
            <DiagnosisReportActions lead={lead} />
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
              {expanded ? 'Esconder' : 'Mostrar'}
            </Button>
          )
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
