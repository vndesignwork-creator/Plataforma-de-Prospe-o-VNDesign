'use client';

/**
 * O que falta o cliente enviar (textos, fotos, logótipo, acessos…): a lista aparece
 * na página do cliente, onde ele envia a nota ou os ficheiros; aqui marca-se como recebido.
 */
import { CLIENT_REQUEST_PRESETS, CLIENT_REQUEST_STATUS_LABELS, CLIENT_REQUEST_STATUSES, formatDate, type ClientRequest, type ClientRequestStatus, type Lead } from '@vndesign/core';
import { CheckCircle2, CircleDashed, ClipboardList, Download, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useClientRequests, useDeleteClientRequest, useSaveClientRequest } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

const STATUS_STYLE: Record<ClientRequestStatus, string> = { pending: 'text-warning', sent: 'text-accent-text', done: 'text-success' };

function RequestRow({ lead, r }: { lead: Lead; r: ClientRequest }) {
  const save = useSaveClientRequest(lead.id);
  const remove = useDeleteClientRequest(lead.id);
  const Icon = r.status === 'done' ? CheckCircle2 : r.status === 'sent' ? Send : CircleDashed;
  return (
    <li className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className={cn('h-4 w-4 shrink-0', STATUS_STYLE[r.status])} aria-hidden />
        <span className="min-w-0 flex-1 font-medium break-words">
          {r.title}
          {r.sent_at && r.status !== 'pending' ? <span className="ml-1.5 text-xs font-normal text-muted tabular">{formatDate(r.sent_at).slice(0, 5)}</span> : null}
        </span>
        <Select
          value={r.status}
          onChange={(e) => save.mutate({ id: r.id, body: { status: e.target.value as ClientRequestStatus } }, { onError: (err) => toast.error(errorMessage(err)) })}
          disabled={save.isPending}
          className={cn('h-8 w-auto py-0 text-xs font-medium', STATUS_STYLE[r.status])}
          aria-label={`Estado de ${r.title}`}
        >
          {CLIENT_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CLIENT_REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => {
            if (r.files.length && !window.confirm(`Apagar "${r.title}" e os ${r.files.length} ficheiro(s) que o cliente enviou?`)) return;
            remove.mutate(r.id, { onError: (e) => toast.error(errorMessage(e)) });
          }}
          aria-label={`Apagar ${r.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      {r.client_note ? <p className="ml-6 rounded-md bg-surface-2 px-2 py-1 text-xs whitespace-pre-line">{r.client_note}</p> : null}
      {r.files.length ? (
        <ul className="ml-6 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {r.files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <a href={`/api/v1/client-requests/${r.id}/files/${i}`} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <Download className="h-3 w-3" aria-hidden /> {f.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ClientRequestsSection({ lead }: { lead: Lead }) {
  const { data: requests, isLoading } = useClientRequests(lead.id);
  const save = useSaveClientRequest(lead.id);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const missing = requests?.filter((r) => r.status === 'pending').length ?? 0;
  const presets = CLIENT_REQUEST_PRESETS.filter((p) => !requests?.some((r) => r.title === p));

  async function add(value: string, typed = false) {
    if (!value.trim()) return;
    try {
      await save.mutateAsync({ body: { title: value.trim() } });
      if (typed) setTitle('');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby={`client-requests-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`client-requests-${lead.id}`}
        icon={ClipboardList}
        title="O que falta o cliente enviar"
        summary={requests?.length ? (missing ? `falta${missing === 1 ? '' : 'm'} ${missing} de ${requests.length}` : 'tudo recebido') : null}
        action={
          adding ? null : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Pedir
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-full" />
      ) : requests?.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {requests.map((r) => (
            <RequestRow key={r.id} lead={lead} r={r} />
          ))}
        </ul>
      ) : !adding ? (
        <p className="mt-1 text-xs text-muted">Pede ao cliente os textos, as fotos ou os acessos: a lista aparece na página do cliente, onde ele envia tudo.</p>
      ) : null}
      {adding ? (
        <div className="mt-2 flex flex-col gap-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add(title, true);
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Fotografias da equipa" maxLength={200} aria-label="O que falta o cliente enviar" autoFocus className="h-9" />
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Fechar
            </Button>
            <Button type="submit" size="sm" loading={save.isPending} disabled={!title.trim()}>
              Juntar
            </Button>
          </form>
          {presets.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pedidos comuns">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void add(p)}
                  disabled={save.isPending}
                  className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent-text disabled:opacity-50"
                >
                  + {p}
                </button>
              ))}
            </div>
          ) : null}
          {!lead.project_completed_at ? <p className="text-xs text-muted">O cliente vê esta lista na página do projeto (Cliente → Página para o cliente).</p> : null}
        </div>
      ) : null}
    </section>
  );
}
