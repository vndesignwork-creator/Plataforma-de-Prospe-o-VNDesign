'use client';

import { REPLY_KIND_LABELS, formatDate, gmailSearchUrl, leadPath, needsAnswer, replySubject, timeAgo, type ReplyItem } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ExternalLink, MailOpen } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { errorMessage } from '@/lib/api-client';
import { useMailAccount, useMarkRepliesHandled, useReplies } from '@/lib/queries';
import { cn } from '@/lib/utils';

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

function ReplyRow({ item, gmail, showPending }: { item: ReplyItem; gmail: boolean; showPending: boolean }) {
  const qc = useQueryClient();
  const handled = useMarkRepliesHandled();
  const open = gmail ? gmailSearchUrl(item.message_id) : null;
  const pending = needsAnswer(item);
  const who = item.from_name || item.from || 'Lead';
  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-3" aria-label={`${item.lead.company_name}: ${item.subject}`}>
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
          <a href={open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-accent-text hover:bg-surface-2">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir no Gmail
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
export function RepliesCard({ className }: { className?: string }) {
  const { data, isLoading, error, refetch, isFetching } = useReplies(DAYS);
  const [limit, setLimit] = useState(PAGE);
  const { data: account } = useMailAccount();
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const items = (data?.items ?? []).filter((i) => view === 'all' || needsAnswer(i));
  const gmail = account?.provider === 'gmail';
  const detection = !!account?.reply_detection;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Respostas"
        description={`O que os leads te responderam (últimos ${DAYS} dias)`}
        actions={
          <div role="tablist" aria-label="Que respostas" className="flex gap-1 rounded-lg bg-surface-2 p-0.5 text-sm">
            {(['pending', 'all'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setView(v);
                  setLimit(PAGE);
                }}
                className={cn('rounded-md px-2.5 py-1 font-medium', view === v ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
              >
                {v === 'pending' ? 'Por responder' : 'Todas'}
                {data ? <span className="ml-1 text-xs text-muted tabular">{v === 'pending' ? data.pending : data.items.length}</span> : null}
              </button>
            ))}
          </div>
        }
      />
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
              <Link href="/definicoes/email" className="text-accent-text hover:underline">
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
        <ul className="flex flex-col divide-y divide-border" aria-label={view === 'pending' ? 'Respostas por responder' : 'Todas as respostas'}>
          {items.slice(0, limit).map((item) => (
            <ReplyRow key={item.id} item={item} gmail={gmail} showPending={view === 'all'} />
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
    </Card>
  );
}
