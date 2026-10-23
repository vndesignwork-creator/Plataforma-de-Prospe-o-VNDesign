'use client';

/**
 * Limpar duplicados: cada grupo (mesmo email, site ou nome) com o principal
 * sugerido (o mais avançado no pipeline). "Juntar" passa tudo dos outros para o
 * principal — tarefas, pagamentos, reuniões, horas, propostas, linha do tempo… —
 * e apaga-os; "Comparar" abre a junção campo a campo; "Não são duplicados"
 * esconde o grupo de vez.
 */
import { DUPLICATE_REASON_LABELS, formatDate, leadPath, type DuplicateGroup } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Columns2, EyeOff, Merge } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateLead } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { StatusBadge } from './badges';

function useDuplicateGroups() {
  return useQuery({
    queryKey: ['lead-duplicates'],
    queryFn: () => api<{ data: DuplicateGroup[] }>('/leads/duplicates').then((r) => r.data),
  });
}

/** Junta os outros no principal (o merge aceita até 10 de cada vez). */
async function mergeGroup(primaryId: string, others: string[]) {
  for (let i = 0; i < others.length; i += 10) {
    await api(`/leads/${primaryId}/merge`, { method: 'POST', body: { duplicate_ids: others.slice(i, i + 10), values: {} } });
  }
}

export function DuplicatesView() {
  const { data: groups, isLoading, error } = useDuplicateGroups();
  const qc = useQueryClient();
  const invalidateLead = useInvalidateLead();
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['lead-duplicates'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['board'] });
    void qc.invalidateQueries({ queryKey: ['lead-tags'] });
  }

  async function mergeAll() {
    if (!groups) return;
    setBusyAll(true);
    let merged = 0;
    try {
      for (const g of groups) {
        await mergeGroup(
          g.primary_id,
          g.leads.map((l) => l.id).filter((id) => id !== g.primary_id),
        );
        invalidateLead(g.primary_id);
        merged += g.leads.length - 1;
      }
      toast.success(`${merged} duplicado${merged === 1 ? '' : 's'} juntado${merged === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyAll(false);
      setConfirmAll(false);
      refresh();
    }
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
        {errorMessage(error)}
      </p>
    );
  }
  if (isLoading || !groups) return <Skeleton className="h-40" />;
  if (!groups.length) {
    return (
      <Card>
        <EmptyState title="Sem duplicados 🎉">
          <p>Não há leads com o mesmo email, site ou nome.</p>
        </EmptyState>
      </Card>
    );
  }

  const total = groups.reduce((sum, g) => sum + g.leads.length - 1, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {groups.length} grupo{groups.length === 1 ? '' : 's'} · {total} lead{total === 1 ? '' : 's'} a mais
        </p>
        <Button variant="outline" onClick={() => setConfirmAll(true)}>
          <Merge className="h-4 w-4" aria-hidden /> Juntar todos nos principais
        </Button>
      </div>
      <ul className="flex flex-col gap-4" aria-label="Grupos de duplicados">
        {groups.map((g) => (
          <GroupCard key={g.key} group={g} onDone={refresh} />
        ))}
      </ul>
      {confirmAll ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setConfirmAll(false) : undefined)}
          title="Juntar todos os duplicados?"
          description={`${total} lead${total === 1 ? '' : 's'} vão juntar-se ao principal sugerido de cada grupo (o mais avançado no pipeline).`}
          className="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmAll(false)} disabled={busyAll}>
                Cancelar
              </Button>
              <Button onClick={() => void mergeAll()} loading={busyAll}>
                <Merge className="h-4 w-4" aria-hidden /> Juntar todos
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">
            Tarefas, pagamentos, reuniões, horas, propostas, contratos e a linha do tempo passam para o principal; os campos do principal ficam (os vazios não
            são preenchidos — para escolher campo a campo usa “Comparar”). Não dá para desfazer.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

function GroupCard({ group, onDone }: { group: DuplicateGroup; onDone: () => void }) {
  const [primary, setPrimary] = useState(group.primary_id);
  const [busy, setBusy] = useState<'merge' | 'ignore' | null>(null);
  const invalidateLead = useInvalidateLead();
  const main = group.leads.find((l) => l.id === primary) ?? group.leads[0]!;
  const others = group.leads.filter((l) => l.id !== main.id);
  const title = `#${main.number} ${main.company_name}`;

  async function merge() {
    setBusy('merge');
    try {
      await mergeGroup(
        main.id,
        others.map((l) => l.id),
      );
      invalidateLead(main.id);
      toast.success(`Juntado em ${title}.`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function ignore() {
    setBusy('ignore');
    try {
      await api('/leads/duplicates/ignore', { method: 'POST', body: { ids: group.leads.map((l) => l.id) } });
      toast.success('Marcados como não duplicados.');
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">{group.leads.length} leads</span>
          {group.reasons.map((r) => (
            <Badge key={r} tone="warning">
              {DUPLICATE_REASON_LABELS[r] ?? r}
            </Badge>
          ))}
        </div>
        <fieldset className="flex flex-col divide-y divide-border">
          <legend className="sr-only">Qual fica (o principal)?</legend>
          {group.leads.map((l) => {
            const isMain = l.id === main.id;
            return (
              <label key={l.id} className={cn('flex cursor-pointer items-start gap-3 px-4 py-3', isMain && 'bg-accent-soft/40')}>
                <input type="radio" name={`principal-${group.key}`} checked={isMain} onChange={() => setPrimary(l.id)} className="mt-1 h-4 w-4" aria-label={`Fica #${l.number} ${l.company_name}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={leadPath(l)} className="font-semibold hover:text-accent-text hover:underline" onClick={(e) => e.stopPropagation()}>
                      <span className="mr-1 text-muted tabular">#{l.number}</span>
                      {l.company_name}
                    </Link>
                    <StatusBadge status={l.status} />
                    {l.archived_at ? <Badge>Arquivado</Badge> : null}
                    {isMain ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-text">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Fica
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {[l.email, l.website, l.phone, l.city, `criado a ${formatDate(l.created_at.slice(0, 10))}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {!isMain ? (
                  <Link
                    href={`${leadPath(main, '/juntar')}?com=${l.id}`}
                    className={cn(buttonClasses('ghost', 'sm'), 'shrink-0')}
                    title="Escolher campo a campo o que fica"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden /> Comparar
                  </Link>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => void ignore()} loading={busy === 'ignore'} disabled={!!busy}>
            <EyeOff className="h-3.5 w-3.5" aria-hidden /> Não são duplicados
          </Button>
          <Button size="sm" onClick={() => void merge()} loading={busy === 'merge'} disabled={!!busy} aria-label={`Juntar em ${title}`}>
            <Merge className="h-3.5 w-3.5" aria-hidden /> Juntar em {title}
          </Button>
        </div>
      </Card>
    </li>
  );
}
