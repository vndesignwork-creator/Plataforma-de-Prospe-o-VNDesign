'use client';

/**
 * Reciclagem: leads apagados nos últimos 30 dias. Repor (volta tudo como
 * estava), apagar de vez um a um ou esvaziar. Depois de 30 dias saem sozinhos.
 */
import { LEAD_STATUS_META, formatDate, formatDateTime, type TrashItem } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusIcon } from '@/components/icons/lead-icons';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api-client';
import { useTeamNames } from '@/lib/queries';

export function useTrash() {
  return useQuery({
    queryKey: ['lead-trash'],
    queryFn: () => api<{ data: TrashItem[] }>('/leads/trash').then((r) => r.data),
  });
}

/** "Anular" depois de apagar: repõe estes leads da reciclagem (procura-os pelo id do lead). */
export async function restoreDeletedLeads(leadIds: readonly string[]): Promise<number> {
  const { data } = await api<{ data: TrashItem[] }>('/leads/trash');
  const ids = data.filter((t) => leadIds.includes(t.lead_id)).map((t) => t.id);
  if (!ids.length) return 0;
  const res = await api<{ data: { lead_ids: string[] } }>('/leads/trash/restore', { method: 'POST', body: { ids } });
  return res.data.lead_ids.length;
}

export function TrashView() {
  const { data: items, isLoading, error } = useTrash();
  const { data: team } = useTeamNames();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TrashItem | 'all' | null>(null);

  function refresh() {
    for (const key of ['lead-trash', 'leads', 'board', 'today', 'lead-tags', 'dashboard']) void qc.invalidateQueries({ queryKey: [key] });
  }

  async function restore(item: TrashItem) {
    setBusy(item.id);
    try {
      await api('/leads/trash/restore', { method: 'POST', body: { ids: [item.id] } });
      refresh();
      toast.success(`#${item.number} ${item.company_name} reposto.`, {
        action: { label: 'Abrir', onClick: () => router.push(`/leads/${item.lead_id}`) },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function purge(target: TrashItem | 'all') {
    setBusy(target === 'all' ? 'all' : target.id);
    try {
      const { data } = await api<{ data: { deleted: number } }>('/leads/trash', { method: 'DELETE', body: target === 'all' ? undefined : { ids: [target.id] } });
      refresh();
      toast.success(data.deleted === 1 ? 'Apagado de vez.' : `${data.deleted} leads apagados de vez.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
        {errorMessage(error)}
      </p>
    );
  }
  if (isLoading || !items) return <Skeleton className="h-40" />;
  if (!items.length) {
    return (
      <Card>
        <EmptyState title="A reciclagem está vazia">
          <p>Quando apagares um lead, fica aqui 30 dias para o poderes repor.</p>
        </EmptyState>
      </Card>
    );
  }
  const who = (id: string | null) => (id ? team?.find((m) => m.user_id === id)?.name : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {items.length} lead{items.length === 1 ? '' : 's'} na reciclagem
        </p>
        <Button variant="outline" className="text-danger" onClick={() => setConfirm('all')} loading={busy === 'all'}>
          <Trash2 className="h-4 w-4" aria-hidden /> Esvaziar
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-border" aria-label="Leads apagados">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <StatusIcon status={item.status} className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <span className="mr-1 text-muted tabular">#{item.number}</span>
                  {item.company_name}
                </p>
                <p className="text-xs text-muted">
                  {LEAD_STATUS_META[item.status].label} · apagado a {formatDateTime(item.deleted_at)}
                  {who(item.deleted_by) ? ` por ${who(item.deleted_by)}` : ''} · {item.items} registo{item.items === 1 ? '' : 's'} guardado{item.items === 1 ? '' : 's'} · sai de vez a{' '}
                  {formatDate(item.purge_on)}
                </p>
              </div>
              <Button size="sm" onClick={() => void restore(item)} loading={busy === item.id} disabled={!!busy} aria-label={`Repor #${item.number} ${item.company_name}`}>
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Repor
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirm(item)}
                disabled={!!busy}
                aria-label={`Apagar de vez #${item.number} ${item.company_name}`}
                title="Apagar de vez"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      {confirm ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setConfirm(null) : undefined)}
          title={confirm === 'all' ? 'Esvaziar a reciclagem?' : `Apagar de vez #${confirm.number} ${confirm.company_name}?`}
          description="Apaga de vez, com os ficheiros. Não pode ser desfeito."
          className="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void purge(confirm)} loading={!!busy}>
                Apagar de vez
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );
}
