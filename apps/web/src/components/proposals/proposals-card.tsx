'use client';

import { PROPOSAL_STATUS_LABELS, formatCurrency, formatDate, type Lead, type ProposalStatus, leadPath } from '@vndesign/core';
import { Calculator, FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { useProposals, useSettings } from '@/lib/queries';
import { QuoteCalculatorDialog } from './quote-calculator';

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
  if (lead.anonymized_at && !data?.length) return null;

  return (
    <Card>
      <CardHeader
        title="Propostas"
        description="Proposta em PDF com os teus pacotes, pronta a enviar."
        actions={
          !lead.anonymized_at ? (
            <>
              {settings?.features.quote_calculator ? (
                <Button size="sm" variant="ghost" onClick={() => setCalculating(true)}>
                  <Calculator className="h-3.5 w-3.5" aria-hidden /> Calcular
                </Button>
              ) : null}
              <Link href={leadPath(lead, '/propostas/nova')} className={buttonClasses('outline', 'sm')}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Nova proposta
              </Link>
            </>
          ) : null
        }
      />
      {isLoading ? (
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
              <a
                href={`/api/v1/proposals/${p.id}/pdf`}
                target="_blank"
                rel="noopener"
                className={buttonClasses('ghost', 'sm', 'shrink-0')}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden /> Ver PDF
                <span className="sr-only">(abre num novo separador)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">Ainda não há propostas para este lead.</p>
      )}
      {calculating && settings ? <QuoteCalculatorDialog lead={lead} settings={settings} onClose={() => setCalculating(false)} /> : null}
    </Card>
  );
}
