'use client';

import { PROPOSAL_STATUS_LABELS, formatCurrency, formatDate, type Lead, type ProposalStatus, leadPath } from '@vndesign/core';
import { Calculator, Copy, FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { useProposals, useSettings } from '@/lib/queries';
import { QuoteCalculatorDialog } from './quote-calculator';
import { CopyProposalDialog, useCopyProposal } from './copy-proposal';

export const PROPOSAL_TONES: Record<ProposalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  rascunho: 'neutral',
  enviada: 'accent',
  aceite: 'success',
  recusada: 'danger',
};

export function ProposalsCard({ lead }: { lead: Lead }) {
  const { data, isLoading } = useProposals(lead.id);
  const { data: settings } = useSettings();
  const [calculating, setCalculating] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState(false);
  const { copy, copying } = useCopyProposal(lead);
  // A lista pode ficar recolhida; a escolha fica lembrada neste browser.
  const [collapsed, setCollapsed] = useCollapsed('propostas');
  if (lead.anonymized_at && !data?.length) return null;
  const hidden = collapsed && !!data?.length;

  return (
    <Card>
      <CardHeader
        title="Propostas"
        description={hidden ? `${data!.length} proposta${data!.length === 1 ? '' : 's'}` : 'Proposta em PDF com os teus pacotes, pronta a enviar.'}
        className={hidden ? 'border-b-0' : undefined}
        actions={
          !lead.anonymized_at || data?.length ? (
            <>
              {settings?.features.quote_calculator && !lead.anonymized_at ? (
                <Button size="sm" variant="ghost" onClick={() => setCalculating(true)}>
                  <Calculator className="h-3.5 w-3.5" aria-hidden /> Calcular
                </Button>
              ) : null}
              {!lead.anonymized_at ? (
                <>
                  {/* Partir de uma proposta já feita (deste ou de outro cliente): poupa escrever tudo de novo. */}
                  <Button size="sm" variant="ghost" onClick={() => setCopyingFrom(true)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Partir de outra
                  </Button>
                  <Link href={leadPath(lead, '/propostas/nova')} className={buttonClasses('outline', 'sm')}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Nova proposta
                  </Link>
                </>
              ) : null}
              {data?.length ? (
                <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label={`Propostas (${data.length})`} />
              ) : null}
            </>
          ) : null
        }
      />
      {hidden ? null : isLoading ? (
        <div className="p-4">
          <Skeleton className="h-12" />
        </div>
      ) : data?.length ? (
        <ul className="divide-y divide-border" aria-label="Propostas do lead">
          {data.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={leadPath(lead, `/propostas/${p.id}`)} className="font-medium hover:underline">
                  <span className="text-muted tabular">{p.code}</span> {p.title}
                </Link>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={PROPOSAL_TONES[p.status]}>{PROPOSAL_STATUS_LABELS[p.status]}</Badge>
                  <span className="tabular">{formatCurrency(p.total)}</span>
                  <span>· criada a {formatDate(p.created_at.slice(0, 10))}</span>
                  {p.valid_until ? <span>· válida até {formatDate(p.valid_until)}</span> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!lead.anonymized_at ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copy(p.id)}
                    disabled={!!copying}
                    aria-label={`Duplicar a proposta ${p.code}`}
                    title="Duplicar: rascunho novo igual a esta"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicar
                  </Button>
                ) : null}
                <a href={`/api/v1/proposals/${p.id}/pdf`} target="_blank" rel="noopener" className={buttonClasses('ghost', 'sm')}>
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Ver PDF
                  <span className="sr-only">(abre num novo separador)</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">Ainda não há propostas para este lead.</p>
      )}
      {calculating && settings ? <QuoteCalculatorDialog lead={lead} settings={settings} onClose={() => setCalculating(false)} /> : null}
      {copyingFrom ? <CopyProposalDialog lead={lead} onClose={() => setCopyingFrom(false)} /> : null}
    </Card>
  );
}
