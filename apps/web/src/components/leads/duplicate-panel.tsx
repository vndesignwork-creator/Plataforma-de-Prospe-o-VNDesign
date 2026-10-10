'use client';

import { DUPLICATE_REASON_LABELS, type DoNotContact, type DuplicateMatch, leadPath } from '@vndesign/core';
import { AlertTriangle, Ban, ExternalLink, GitMerge } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './badges';

/** Aviso de possíveis duplicados / empresa na lista "não contactar". */
export function DuplicatePanel({
  duplicates,
  doNotContact,
  onMerge,
  mergeLabel = 'Juntar',
}: {
  duplicates: DuplicateMatch[];
  doNotContact: DoNotContact[];
  onMerge?: (match: DuplicateMatch) => void;
  mergeLabel?: string;
}) {
  if (!duplicates.length && !doNotContact.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {doNotContact.length ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <Ban className="h-4 w-4" aria-hidden />
            Empresa na lista &ldquo;não contactar&rdquo;
          </p>
          <ul className="mt-1 list-disc pl-6 text-fg">
            {doNotContact.map((d) => (
              <li key={d.id}>
                {d.company_name}
                {d.reason ? <span className="text-muted"> — {d.reason}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">Não é possível criar este lead enquanto estiver na lista (Definições).</p>
        </div>
      ) : null}
      {duplicates.length ? (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm" role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {duplicates.some((d) => d.strength === 'strong')
              ? duplicates.length === 1
                ? 'Possível duplicado'
                : `${duplicates.length} possíveis duplicados`
              : duplicates.length === 1
                ? 'Lead com nome parecido'
                : `${duplicates.length} leads com nome parecido`}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {duplicates.map((d) => (
              <li key={d.lead_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-surface px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="text-muted tabular">#{d.number}</span>{' '}
                  <span className="font-semibold">{d.company_name}</span>
                  {d.city ? <span className="text-muted"> · {d.city}</span> : null}
                  <span className="mt-1 flex flex-wrap gap-1">
                    <StatusBadge status={d.status} />
                    {d.reasons.map((r) => (
                      <Badge key={r} tone={d.strength === 'strong' ? 'warning' : 'neutral'}>
                        {DUPLICATE_REASON_LABELS[r] ?? r}
                      </Badge>
                    ))}
                  </span>
                </span>
                <span className="flex gap-2">
                  <a
                    href={leadPath(d)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-accent-text hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Abrir<span className="sr-only"> #{d.number} num novo separador</span>
                  </a>
                  {onMerge ? (
                    <Button size="sm" variant="outline" onClick={() => onMerge(d)}>
                      <GitMerge className="h-3.5 w-3.5" aria-hidden />
                      {mergeLabel}
                      <span className="sr-only"> (#{d.number})</span>
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
