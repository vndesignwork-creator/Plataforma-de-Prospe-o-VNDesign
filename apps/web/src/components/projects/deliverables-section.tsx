'use client';

/**
 * Ficheiros e entregas do projeto: links (Google Drive, Figma, Canva…) com o
 * estado "Por enviar" → "Enviada" → "Aprovada pelo cliente".
 */
import { DELIVERABLE_STATUS_LABELS, DELIVERABLE_STATUSES, formatDate, type DeliverableStatus, type Lead, type ProjectDeliverable } from '@vndesign/core';
import { CheckCircle2, ExternalLink, FolderOpen, Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useDeleteDeliverable, useDeliverables, useSaveDeliverable } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { SectionHeader } from './section-header';

const STATUS_STYLE: Record<DeliverableStatus, string> = {
  rascunho: 'text-muted',
  enviada: 'text-accent-text',
  aprovada: 'text-success',
};

function DeliverableRow({ lead, d }: { lead: Lead; d: ProjectDeliverable }) {
  const save = useSaveDeliverable(lead.id);
  const remove = useDeleteDeliverable(lead.id);
  const date = d.status === 'aprovada' ? d.approved_at : d.status === 'enviada' ? d.sent_at : null;

  async function setStatus(status: DeliverableStatus) {
    try {
      await save.mutateAsync({ id: d.id, body: { status } });
      if (status !== 'rascunho') toast.success(status === 'aprovada' ? `Aprovada: ${d.title}. ✅` : `Marcada como enviada: ${d.title}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {d.status === 'aprovada' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
      ) : d.status === 'enviada' ? (
        <Send className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      ) : (
        <FolderOpen className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        {d.url ? (
          <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 font-medium hover:text-accent-text hover:underline" title={d.url}>
            <span className="truncate">{d.title}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="sr-only">(abre num novo separador: {displayHost(d.url)})</span>
          </a>
        ) : (
          <span className="font-medium break-words">{d.title}</span>
        )}
        {date ? <span className="ml-1.5 text-xs text-muted tabular">{formatDate(date).slice(0, 5)}</span> : null}
      </span>
      <Select
        value={d.status}
        onChange={(e) => void setStatus(e.target.value as DeliverableStatus)}
        disabled={save.isPending}
        className={cn('h-8 w-auto py-0 text-xs font-medium', STATUS_STYLE[d.status])}
        aria-label={`Estado de ${d.title}`}
      >
        {DELIVERABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {DELIVERABLE_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => remove.mutate(d.id, { onError: (e) => toast.error(errorMessage(e)) })}
        aria-label={`Apagar ${d.title}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </li>
  );
}

export function DeliverablesSection({ lead }: { lead: Lead }) {
  const { data: deliverables, isLoading } = useDeliverables(lead.id);
  const save = useSaveDeliverable(lead.id);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', url: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const approved = deliverables?.filter((d) => d.status === 'aprovada').length ?? 0;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync({ body: { title: form.title, url: form.url || null } });
      setForm({ title: '', url: '' });
      toast.success('Acrescentado.');
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby={`deliverables-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`deliverables-${lead.id}`}
        icon={FolderOpen}
        title="Ficheiros e entregas"
        summary={deliverables?.length ? `${approved} de ${deliverables.length} aprovada${deliverables.length === 1 ? '' : 's'}` : null}
        action={
          adding ? null : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Entrega
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : deliverables?.length ? (
        <ul className="mt-2 flex flex-col gap-1.5" aria-label="Ficheiros e entregas">
          {deliverables.map((d) => (
            <DeliverableRow key={d.id} lead={lead} d={d} />
          ))}
        </ul>
      ) : !adding ? (
        <p className="mt-2 text-sm text-muted">Guarda aqui os links do Drive, Figma ou Canva e marca o que o cliente já aprovou.</p>
      ) : null}
      {adding ? (
        <form onSubmit={add} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" noValidate aria-label="Nova entrega">
          <div>
            <Input
              aria-label="Nome da entrega"
              placeholder="Ex.: Logótipo — versão final"
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              aria-invalid={errors.title ? true : undefined}
              autoFocus
            />
            {errors.title ? <p className="mt-1 text-xs text-danger">{errors.title[0]}</p> : null}
          </div>
          <div>
            <Input
              aria-label="Link (opcional)"
              placeholder="Link (Drive, Figma…) — opcional"
              inputMode="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              aria-invalid={errors.url ? true : undefined}
            />
            {errors.url ? <p className="mt-1 text-xs text-danger">{errors.url[0]}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={save.isPending} className="h-10">
              Acrescentar
            </Button>
            <Button size="sm" variant="ghost" className="h-10" onClick={() => setAdding(false)}>
              Fechar
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
