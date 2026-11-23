'use client';

import {
  PROPOSAL_EXTEND_DAYS,
  PROPOSAL_STATUS_LABELS,
  extendedValidity,
  formatCurrency,
  formatDate,
  proposalExpiry,
  proposalExpiryLabel,
  todayIso,
  type Lead,
  type Proposal,
  type ProposalStatus,
  leadPath,
} from '@vndesign/core';
import { Calculator, CalendarPlus, Copy, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { errorMessage } from '@/lib/api-client';
import { useExtendProposal, useProposals, useSettings } from '@/lib/queries';
import { QuoteCalculatorDialog } from './quote-calculator';
import { CopyProposalDialog, useCopyProposal } from './copy-proposal';

export const PROPOSAL_TONES: Record<ProposalStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  rascunho: 'neutral',
  enviada: 'accent',
  aceite: 'success',
  recusada: 'danger',
};

/** Prolongar a validade: +7, +14 ou +30 dias (a contar de hoje se já passou). */
function ExtendValidity({ lead, proposal, today }: { lead: Lead; proposal: Proposal; today: string }) {
  const extend = useExtendProposal(lead.id);
  return (
    <DropdownRoot>
      <DropdownTrigger className={buttonClasses('ghost', 'sm')} aria-label={`Prolongar a validade da proposta ${proposal.code}`}>
        <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Prolongar
      </DropdownTrigger>
      <DropdownContent>
        {PROPOSAL_EXTEND_DAYS.map((days) => {
          const until = extendedValidity(proposal.valid_until, days, today);
          return (
            <DropdownItem
              key={days}
              disabled={extend.isPending}
              onSelect={() => {
                void extend
                  .mutateAsync({ id: proposal.id, validUntil: until })
                  .then(() => toast.success(`Válida até ${formatDate(until)}.`), (e: unknown) => toast.error(errorMessage(e)));
              }}
            >
              <span>
                Mais {days} dias
                <span className="block text-xs text-muted">Até {formatDate(until)}</span>
              </span>
            </DropdownItem>
          );
        })}
      </DropdownContent>
    </DropdownRoot>
  );
}

export function ProposalsCard({ lead }: { lead: Lead }) {
  const { data, isLoading } = useProposals(lead.id);
  const { data: settings } = useSettings();
  const [calculating, setCalculating] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState(false);
  const { copy, copying } = useCopyProposal(lead);
  // A lista pode ficar recolhida; a escolha fica lembrada neste browser.
  const [collapsed, setCollapsed] = useCollapsed('propostas');
  const today = todayIso();
  const expiryOn = settings?.features.proposal_expiry !== false;
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
        <div className="p-5">
          <Skeleton className="h-12" />
        </div>
      ) : data?.length ? (
        <ul className="divide-y divide-border" aria-label="Propostas do lead">
          {data.map((p) => {
            const expiry = proposalExpiry(p, today);
            return (
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
                  {expiryOn && expiry ? <Badge tone={expiry.state === 'expirada' ? 'danger' : 'warning'}>{proposalExpiryLabel(expiry)}</Badge> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {expiryOn && expiry && !lead.anonymized_at ? <ExtendValidity lead={lead} proposal={p} today={today} /> : null}
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
            );
          })}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">Ainda não há propostas para este lead.</p>
      )}
      {calculating && settings ? <QuoteCalculatorDialog lead={lead} settings={settings} onClose={() => setCalculating(false)} /> : null}
      {copyingFrom ? <CopyProposalDialog lead={lead} onClose={() => setCopyingFrom(false)} /> : null}
    </Card>
  );
}
