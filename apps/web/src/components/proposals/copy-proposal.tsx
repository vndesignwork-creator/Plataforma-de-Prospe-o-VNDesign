'use client';

/**
 * Fazer uma proposta a partir de outra: escolhe-se uma proposta já feita (de
 * qualquer lead) e a plataforma cria um rascunho igual para este cliente —
 * mesmos itens, textos e preços. Depois é só ajustar.
 */
import { PROPOSAL_STATUS_LABELS, formatCurrency, formatDate, leadPath, type Lead, type Proposal, type ProposalPick } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useRecentProposals } from '@/lib/queries';
import { PROPOSAL_TONES } from './proposals-card';

/** Copia a proposta `id` para o lead `leadId` e abre o rascunho novo. */
export function useCopyProposal(lead: Lead) {
  const router = useRouter();
  const qc = useQueryClient();
  const [copying, setCopying] = useState<string | null>(null);
  async function copy(id: string, toAnotherLead = false) {
    setCopying(id);
    try {
      const { data } = await api<{ data: Proposal }>(`/proposals/${id}/duplicate`, {
        method: 'POST',
        body: toAnotherLead ? { lead_id: lead.id } : {},
      });
      void qc.invalidateQueries({ queryKey: ['proposals', lead.id] });
      toast.success(`Proposta ${data.code} criada a partir da outra. Ajusta o que precisares.`);
      router.push(leadPath(lead, `/propostas/${data.id}`));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCopying(null);
    }
  }
  return { copy, copying };
}

export function CopyProposalDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useRecentProposals(search);
  const { copy, copying } = useCopyProposal(lead);
  const others = (data ?? []).filter((p) => p.lead.id !== lead.id);
  const mine = (data ?? []).filter((p) => p.lead.id === lead.id);
  const groups: { label: string; list: ProposalPick[] }[] = [
    ...(mine.length ? [{ label: 'Deste cliente', list: mine }] : []),
    ...(others.length ? [{ label: 'De outros clientes', list: others }] : []),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Partir de outra proposta"
      description={`Escolhe uma proposta já feita: fica um rascunho igual para ${lead.company_name}, pronto a ajustar.`}
      className="sm:max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar por empresa, título ou número…"
            aria-label="Procurar proposta"
            className="pl-9"
          />
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="py-6 text-center text-sm text-muted">
            {search ? 'Nenhuma proposta encontrada.' : 'Ainda não há propostas para copiar.'}
          </p>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-border">
            {groups.map((group) => (
              <section key={group.label}>
                <h3 className="sticky top-0 bg-surface-2 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{group.label}</h3>
                <ul>
                  {group.list.map((p) => (
                    <li key={p.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        onClick={() => void copy(p.id, p.lead.id !== lead.id)}
                        disabled={!!copying}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-50"
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="tabular text-xs text-muted">{p.code}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                          <span className="tabular shrink-0 text-sm">{formatCurrency(p.total)}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <Badge tone={PROPOSAL_TONES[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                          <span>
                            #{p.lead.number} {p.lead.company_name}
                          </span>
                          <span>· {p.items} {p.items === 1 ? 'item' : 'itens'}</span>
                          <span>· {formatDate(p.created_at.slice(0, 10))}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-muted">
          <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Copiam-se os itens, os preços, o texto inicial, as condições de pagamento e as notas. A validade é nova e o estado fica em rascunho.
        </p>
      </div>
    </Dialog>
  );
}
