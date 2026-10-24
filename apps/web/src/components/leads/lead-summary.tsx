'use client';

/**
 * "Resumo IA" (antes de ligar): a IA lê a ficha e diz em poucas frases quem é,
 * o que já se falou, o que ficou combinado, o próximo passo e um cuidado a ter.
 * Não grava nada; o próximo passo pode passar a próxima ação e o cuidado pode
 * ficar como nota afixada. É o contrário das "Notas com IA" (essas escrevem).
 */
import { addDays, todayIso, type Lead, type LeadSummary } from '@vndesign/core';
import { BellRing, Pin, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api-client';
import { consumeLeadAction } from '@/lib/lead-actions';
import { useUpdateLead } from '@/lib/queries';
import { PinnedNoteDialog } from './pinned-note';

export function LeadSummaryButton({ lead, className }: { lead: Lead; className?: string }) {
  // Pesquisa rápida → "Resumo com IA" abre logo.
  const [open, setOpen] = useState(() => consumeLeadAction('resumo'));
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="A IA lê a ficha e resume antes de contactares">
        <Sparkles className="h-4 w-4 text-accent-text" aria-hidden />
        Resumo IA
      </button>
      {open ? <SummaryDialog lead={lead} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SummaryDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  // Um pedido por abertura (não fica em cache: a ficha muda).
  const summary = useQuery({
    queryKey: ['lead-summary', lead.id],
    queryFn: () => api<{ data: LeadSummary }>(`/leads/${lead.id}/summary`, { method: 'POST' }).then((r) => r.data),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const result = summary.data ?? null;
  const error = summary.error ? errorMessage(summary.error) : null;
  const [pinning, setPinning] = useState<string | null>(null);
  const update = useUpdateLead(lead.id);

  async function applyNextStep(text: string) {
    try {
      await update.mutateAsync({ next_action_text: text.slice(0, 300), next_action_on: lead.next_action_on ?? addDays(todayIso(), 1) });
      toast.success('Próxima ação atualizada.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <>
      <Dialog
        open={!pinning}
        onOpenChange={(o) => (!o ? onClose() : undefined)}
        title={`Resumo de ${lead.company_name}`}
        description="Feito pela IA a partir da ficha. Confirma antes de usar."
        className="max-w-lg"
        footer={
          <>
            {error ? (
              <Button variant="outline" onClick={() => void summary.refetch()} loading={summary.isFetching}>
                Tentar outra vez
              </Button>
            ) : null}
            <Button onClick={onClose}>Fechar</Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : !result ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
            <Sparkles className="h-4 w-4 animate-pulse text-accent-text" aria-hidden /> A ler a ficha…
          </p>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <p className="leading-relaxed">{result.summary}</p>
            {result.agreed ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Combinado</h3>
                <p>{result.agreed}</p>
              </section>
            ) : null}
            {result.next_step ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Próximo passo</h3>
                <p>{result.next_step}</p>
                <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => void applyNextStep(result.next_step!)} loading={update.isPending}>
                  <BellRing className="h-3.5 w-3.5" aria-hidden /> Usar como próxima ação
                </Button>
              </section>
            ) : null}
            {result.watch_out ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Atenção</h3>
                <p>{result.watch_out}</p>
                <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => setPinning(result.watch_out!)}>
                  <Pin className="h-3.5 w-3.5" aria-hidden /> Afixar na ficha
                </Button>
              </section>
            ) : null}
          </div>
        )}
      </Dialog>
      {pinning !== null ? <PinnedNoteDialog lead={lead} open initial={pinning.slice(0, 200)} onOpenChange={(o) => !o && setPinning(null)} /> : null}
    </>
  );
}
