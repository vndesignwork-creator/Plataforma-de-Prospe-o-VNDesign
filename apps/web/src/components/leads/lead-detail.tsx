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
} from '@vndesign/core';
import { Copy, Edit3, ExternalLink, GitMerge, Mail, MoreHorizontal, Phone, ShieldOff, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { useInvalidateLead, useLead, useLeads, useLogActivity, useMe, useUpdateLead } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { FollowUpActions } from '@/components/follow-up/follow-up-actions';
import { ContactScriptsCard } from '@/components/scripts/contact-scripts-card';
import { ActivityTimeline } from './activity-timeline';
import { ChannelLabel, MobileLabel, PageSpeedScore } from './badges';
import { SiteAuditPanel } from './site-audit';
import { AiEmailCard } from './ai-email-card';
import { LeadLocation } from './lead-location';
import { ProposalsCard } from '@/components/proposals/proposals-card';
import { SectorIconView, StatusIcon } from '@/components/icons/lead-icons';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm sm:grid-cols-[11rem_1fr]">
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

export function LeadDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: lead, isLoading, error } = useLead(id);
  const { data: me } = useMe();
  const update = useUpdateLead(id);
  const log = useLogActivity(id);
  const invalidate = useInvalidateLead();
  const [dialog, setDialog] = useState<null | 'delete' | 'anonymize' | 'merge'>(null);

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
          : `Estado: ${LEAD_STATUS_META[status].label}.`,
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

  function openMailto() {
    log.mutate({ type: 'email_mailto' });
    if (!lead!.email) toast.info('Este lead não tem email: escreve o destinatário no teu programa de email.');
    window.location.href = mailtoUrl(lead!.email, lead!.email_subject, lead!.email_body);
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="tabular">
            <Link href="/leads" className="hover:text-fg hover:underline">
              Leads
            </Link>{' '}
            / #{lead.number}
            {lead.sector ? (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 align-[-2px]">
                  <SectorIconView sector={lead.sector} className="h-3.5 w-3.5" />
                  {lead.sector.name}
                </span>
              </>
            ) : null}
          </span>
        }
        title={lead.company_name}
        actions={
          <>
            <label className="sr-only" htmlFor="lead-status">
              Estado
            </label>
            <span className="relative inline-flex">
              <StatusIcon status={lead.status} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <Select
                id="lead-status"
                value={lead.status}
                onChange={(e) => changeStatus(e.target.value as LeadStatus)}
                disabled={update.isPending || Boolean(lead.anonymized_at)}
                className="w-auto pl-9 font-medium"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_META[s].label}
                  </option>
                ))}
              </Select>
            </span>
            {!lead.anonymized_at ? (
              <Link href={`/leads/${lead.id}/editar`} className={buttonClasses('outline')}>
                <Edit3 className="h-4 w-4" aria-hidden />
                Editar
              </Link>
            ) : null}
            <DropdownRoot>
              <DropdownTrigger className={buttonClasses('outline', 'icon')} aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </DropdownTrigger>
              <DropdownContent>
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
              </DropdownContent>
            </DropdownRoot>
          </>
        }
      />

      {lead.anonymized_at ? (
        <p role="status" className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          Lead anonimizado em {formatDateTime(lead.anonymized_at)}. Os dados de contacto foram apagados; mantêm-se só os dados
          estatísticos.
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="Pipeline"
              actions={
                (lead.next_action_on || lead.next_action_text) && !lead.anonymized_at ? <FollowUpActions lead={lead} /> : null
              }
            />
            <dl className="grid px-4 py-2 md:grid-cols-2 md:gap-x-6">
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
              <Row label="Valor estimado">{formatCurrency(lead.estimated_value) || dash}</Row>
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
                  <a href={`tel:${lead.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-accent-text hover:underline">
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
          </Card>

          <Card>
            <CardHeader title="Diagnóstico do site" />
            <dl className="px-4 py-2">
              <div className="grid md:grid-cols-2 md:gap-x-6">
                <Row label="PageSpeed (mobile)">
                  <PageSpeedScore value={lead.pagespeed} />
                </Row>
                <Row label="Mobile?">
                  <MobileLabel mobile={lead.mobile} />
                </Row>
              </div>
              <Row label="Problemas">
                {lead.problems ? <span className="whitespace-pre-line">{lead.problems}</span> : dash}
              </Row>
              <Row label="Ângulo de abordagem">
                {lead.approach_angle ? <span className="whitespace-pre-line">{lead.approach_angle}</span> : dash}
              </Row>
            </dl>
            <SiteAuditPanel lead={lead} />
          </Card>

          {!lead.anonymized_at ? <ContactScriptsCard lead={lead} /> : null}

          <AiEmailCard lead={lead} />

          <ProposalsCard lead={lead} />

          <Card>
            <CardHeader
              title="Email de prospeção"
              description="Pronto a copiar ou abrir no teu cliente de email."
              actions={
                lead.email_body || lead.email_subject ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => copy('all')}>
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar tudo
                    </Button>
                    <Button size="sm" onClick={openMailto}>
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                      Abrir no email
                    </Button>
                  </>
                ) : null
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
              <p className="p-4 text-sm text-muted">
                Ainda não há email de prospeção.{' '}
                {!lead.anonymized_at ? (
                  <Link href={`/leads/${lead.id}/editar`} className="text-accent-text underline">
                    Escrever agora
                  </Link>
                ) : null}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Notas" />
            <p className="p-4 text-sm break-words whitespace-pre-line">{lead.notes ?? <span className="text-muted">Sem notas.</span>}</p>
          </Card>

          <p className="text-xs text-muted">
            Criado em {formatDateTime(lead.created_at)} · atualizado em {formatDateTime(lead.updated_at)}
          </p>
        </div>

        <aside aria-label="Atividade">
          <ActivityTimeline leadId={lead.id} currentUserId={me?.user.id} />
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
              onClick={() => router.push(`/leads/${lead.id}/juntar?com=${l.id}`)}
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
