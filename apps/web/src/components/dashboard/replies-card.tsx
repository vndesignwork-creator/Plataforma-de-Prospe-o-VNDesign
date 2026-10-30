'use client';

import {
  REPLY_KIND_LABELS,
  WEBMAIL_PREFERENCE,
  formatDate,
  leadPath,
  needsAnswer,
  replySubject,
  timeAgo,
  webmailLink,
  type MailAccount,
  type ReplyCheckResult,
  type ReplyItem,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ExternalLink, MailOpen, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { api, errorMessage } from '@/lib/api-client';
import { useMailAccount, useMarkRepliesHandled, usePreference, useReplies, useRole } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { rovingKeyDown, rovingTabIndex } from '@/lib/roving';

const DAYS = 14;
const PAGE = 8;

function KindBadge({ item, showPending }: { item: ReplyItem; showPending: boolean }) {
  if (item.kind === 'reply') {
    if (item.handled) return <Badge tone="success">Respondida</Badge>;
    return showPending ? <Badge tone="accent">Por responder</Badge> : null;
  }
  if (item.kind === 'auto') {
    return <Badge>{item.return_on ? `Ausente até ${formatDate(item.return_on)}` : REPLY_KIND_LABELS.auto}</Badge>;
  }
  return <Badge tone="danger">{REPLY_KIND_LABELS[item.kind]}</Badge>;
}

function ReplyRow({
  item,
  account,
  webmail,
  showPending,
}: {
  item: ReplyItem;
  account: MailAccount | null | undefined;
  webmail: unknown;
  showPending: boolean;
}) {
  const qc = useQueryClient();
  const handled = useMarkRepliesHandled();
  const open = webmailLink(account, webmail, item.message_id);
  const pending = needsAnswer(item);
  const who = item.from_name || item.from || 'Lead';
  return (
    <li
      className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-3"
      aria-label={`${item.lead.company_name}: ${item.subject}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link href={leadPath(item.lead)} className="font-medium hover:underline">
            <span className="text-muted tabular">#{item.lead.number}</span> {item.lead.company_name}
          </Link>
          <KindBadge item={item} showPending={showPending} />
        </p>
        <p className="mt-0.5 truncate text-sm" title={item.subject}>
          “{item.subject}”
        </p>
        <p className="text-xs text-muted">
          {who} · {timeAgo(item.received_at)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {pending ? (
          <SendEmailButton
            lead={item.lead}
            subject={replySubject(item.subject)}
            body=""
            template="Resposta ao lead"
            inReplyTo={item.message_id?.includes('@') ? item.message_id : null}
            title={`Responder a ${item.lead.company_name}`}
            label="Responder"
            variant="soft"
            onSent={() => void qc.invalidateQueries({ queryKey: ['replies'] })}
          />
        ) : null}
        {open ? (
          <a
            href={open.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-accent-text hover:bg-surface-2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {open.label}
          </a>
        ) : null}
        {pending ? (
          <Button
            size="sm"
            variant="ghost"
            loading={handled.isPending}
            onClick={() =>
              handled.mutate(item.lead.id, {
                onSuccess: () => toast.success(`${item.lead.company_name}: marcada como tratada.`),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Já tratei
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Cartão "Respostas": quem respondeu nos últimos 14 dias e o que ainda falta responder. */
/**
 * Quando a caixa de entrada foi lida (sozinha, de 10 em 10 minutos) e o botão
 * "Verificar agora" (a resposta acabou de chegar e não queres esperar).
 */
function InboxStatus({ account }: { account: MailAccount }) {
  const qc = useQueryClient();
  const prospector = useRole() === 'prospector';
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const { data } = await api<{ data: ReplyCheckResult }>('/mail-account/check-replies', { method: 'POST' });
      const found = data.replies.length + (data.bounces?.length ?? 0);
      toast.success(
        data.replies.length
          ? `${data.replies.length === 1 ? '1 resposta nova' : `${data.replies.length} respostas novas`}: ${data.replies.map((r) => r.company_name).join(', ')}.`
          : found
            ? 'Caixa de entrada lida: há emails devolvidos (vê a ficha dos leads).'
            : 'Caixa de entrada lida. Nenhuma resposta nova de leads.',
      );
      if (found || data.out_of_office) {
        void qc.invalidateQueries({ queryKey: ['leads'] });
        void qc.invalidateQueries({ queryKey: ['today'] });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      await Promise.all([qc.invalidateQueries({ queryKey: ['mail-account'] }), qc.invalidateQueries({ queryKey: ['replies'] })]);
      setChecking(false);
    }
  }

  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted">
      <span className={cn(account.imap_error && 'text-danger')}>
        {account.imap_error
          ? `Não foi possível ler a caixa de entrada: ${account.imap_error}`
          : account.imap_checked_at
            ? `Caixa de entrada lida ${timeAgo(account.imap_checked_at)} · lê-se sozinha de 10 em 10 minutos`
            : 'A caixa de entrada ainda não foi lida · lê-se sozinha de 10 em 10 minutos'}
      </span>
      {prospector ? null : (
        <Button size="sm" variant="ghost" onClick={() => void check()} loading={checking}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Verificar agora
        </Button>
      )}
    </div>
  );
}

export function RepliesCard({ className }: { className?: string }) {
  const { data, isLoading, error, refetch, isFetching } = useReplies(DAYS);
  const [limit, setLimit] = useState(PAGE);
  const { data: account } = useMailAccount();
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const items = (data?.items ?? []).filter((i) => view === 'all' || needsAnswer(i));
  const { data: webmail } = usePreference<string>(WEBMAIL_PREFERENCE);
  const detection = !!account?.reply_detection;
  // Muitas respostas: o cartão recolhe-se (fica lembrado neste browser).
  const [collapsed, setCollapsed] = useCollapsed('dashboard-replies');

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Respostas"
        description={
          collapsed && data
            ? data.pending
              ? `${data.pending} por responder · ${data.items.length} nos últimos ${DAYS} dias`
              : `Nenhuma por responder · ${data.items.length} nos últimos ${DAYS} dias`
            : `O que os leads te responderam (últimos ${DAYS} dias)`
        }
        actions={
          <div className="flex items-center gap-1">
            {collapsed ? null : (
              <div role="tablist" aria-label="Que respostas" onKeyDown={rovingKeyDown} className="flex gap-1 rounded-lg bg-surface-2 p-0.5 text-sm">
                {(['pending', 'all'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    tabIndex={rovingTabIndex(view === v, 0)}
                    onClick={() => {
                      setView(v);
                      setLimit(PAGE);
                    }}
                    className={cn(
                      'rounded-md px-2.5 py-1 font-medium',
                      view === v ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                    )}
                  >
                    {v === 'pending' ? 'Por responder' : 'Todas'}
                    {data ? (
                      <span className="ml-1 text-xs text-muted tabular">{v === 'pending' ? data.pending : data.items.length}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label="Respostas" />
          </div>
        }
      />
      {collapsed ? null : (
        <>
          {isLoading ? <Skeleton className="m-3 h-24" /> : null}
          {error && !data ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm">
              <p className="text-danger">Não foi possível carregar as respostas: {errorMessage(error)}</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()} loading={isFetching}>
                Tentar de novo
              </Button>
            </div>
          ) : null}
          {data && !items.length ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted">
              <MailOpen className="h-5 w-5" aria-hidden />
              {account === null || (account && !detection) ? (
                <p>
                  Liga a deteção de respostas em{' '}
                  <Link href="/definicoes/email" className="text-accent-text underline underline-offset-2">
                    Definições → Email
                  </Link>{' '}
                  para veres aqui quem te respondeu.
                </p>
              ) : (
                <p>{view === 'pending' ? 'Nenhuma resposta à tua espera. 🎉' : `Nenhuma resposta nos últimos ${DAYS} dias.`}</p>
              )}
            </div>
          ) : null}
          {items.length ? (
            <ul
              className="flex flex-col divide-y divide-border"
              aria-label={view === 'pending' ? 'Respostas por responder' : 'Todas as respostas'}
            >
              {items.slice(0, limit).map((item) => (
                <ReplyRow key={item.id} item={item} account={account} webmail={webmail} showPending={view === 'all'} />
              ))}
            </ul>
          ) : null}
          {items.length > limit ? (
            <div className="flex justify-center border-t border-border p-2">
              <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE * 2)}>
                <ChevronDown className="h-4 w-4" aria-hidden /> Mostrar mais ({items.length - limit})
              </Button>
            </div>
          ) : null}
          {account && detection ? <InboxStatus account={account} /> : null}
        </>
      )}
    </Card>
  );
}
