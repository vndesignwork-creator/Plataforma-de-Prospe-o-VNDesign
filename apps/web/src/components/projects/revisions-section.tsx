'use client';

/**
 * Rondas de revisão: quantas estão incluídas no preço e as que o cliente já
 * pediu. A partir da primeira além das incluídas, a revisão fica marcada
 * "A cobrar".
 */
import { formatDate, type Lead } from '@vndesign/core';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useDeleteRevision, useProjectInfo, useRevisions, useSaveRevision, useUpdateProjectInfo } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

function RevisionDialog({ lead, used, included, onClose }: { lead: Lead; used: number; included: number; onClose: () => void }) {
  const save = useSaveRevision(lead.id);
  const beyond = used >= included;
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(beyond);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ description, billable });
      toast.success(`Revisão ${used + 1} registada${billable ? ' (a cobrar à parte)' : ''}.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.problem.errors) setError((err.problem.errors as Record<string, string[]>).description?.[0] ?? null);
      else toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={`Revisão ${used + 1}`}
      description={`${lead.company_name} · ${included} incluída${included === 1 ? '' : 's'} no preço`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="revision-form" loading={save.isPending}>
            Registar
          </Button>
        </>
      }
    >
      <form id="revision-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {beyond ? (
          <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            Já foram feitas as {included} revisões incluídas. Esta é extra: combina o valor com o cliente antes de avançar.
          </p>
        ) : null}
        <Field label="O que o cliente pediu" required error={error ?? undefined}>
          <Textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: mudar a cor do logótipo e trocar a foto principal" />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
          A cobrar à parte
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function RevisionsSection({ lead }: { lead: Lead }) {
  const { data: info } = useProjectInfo(lead.id);
  const { data: revisions, isLoading } = useRevisions(lead.id);
  const remove = useDeleteRevision(lead.id);
  const update = useUpdateProjectInfo(lead.id);
  const [adding, setAdding] = useState(false);
  const [included, setIncluded] = useState<string | null>(null);
  const total = info?.revisions_included ?? 2;
  const used = revisions?.length ?? 0;
  const extra = revisions?.filter((r) => r.billable).length ?? 0;

  async function saveIncluded() {
    if (included === null) return;
    const n = Number(included);
    setIncluded(null);
    if (!Number.isInteger(n) || n < 0 || n > 50 || n === total) return;
    try {
      await update.mutateAsync({ revisions_included: n });
      toast.success(`${n} revis${n === 1 ? 'ão incluída' : 'ões incluídas'} no preço.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby={`revisions-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`revisions-${lead.id}`}
        icon={RefreshCcw}
        title="Revisões"
        summary={
          <span className={cn(used > total && 'font-medium text-warning')}>
            {used} de {total}
            {extra ? ` · ${extra} a cobrar` : ''}
          </span>
        }
        action={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Revisão
          </Button>
        }
      />
      <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted">
        Incluídas no preço
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          className="h-8 w-16 text-center"
          value={included ?? String(total)}
          onChange={(e) => setIncluded(e.target.value)}
          onBlur={() => void saveIncluded()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : revisions?.length ? (
        <ol className="mt-2 flex flex-col gap-1.5" aria-label="Revisões pedidas">
          {revisions.map((r, i) => (
            <li key={r.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 w-20 shrink-0 text-xs text-muted tabular">
                {i + 1}.ª · {formatDate(r.requested_on).slice(0, 5)}
              </span>
              <span className="min-w-0 flex-1 break-words">
                {r.description} {r.billable ? <Badge tone="warning">A cobrar</Badge> : null}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="-my-1 h-7 w-7"
                onClick={() => remove.mutate(r.id, { onError: (e) => toast.error(errorMessage(e)) })}
                aria-label={`Apagar a revisão ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">Ainda sem revisões pedidas.</p>
      )}
      {adding ? <RevisionDialog lead={lead} used={used} included={total} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
