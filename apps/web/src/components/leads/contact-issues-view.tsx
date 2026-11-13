'use client';

/**
 * Leads → Contactos a corrigir: emails que voltaram para trás ou de domínios que não recebem
 * emails, telefones com dígitos a mais ou a menos, e o mesmo telefone em leads diferentes.
 */
import { leadPath, type ContactIssues } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'Tudo' },
  { value: 'email', label: 'Emails' },
  { value: 'phone', label: 'Telefones' },
] as const;

export function ContactIssuesView() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const { data, isLoading, error } = useQuery({
    queryKey: ['contact-issues'],
    queryFn: () => api<{ data: ContactIssues }>('/leads/contact-issues').then((r) => r.data),
    staleTime: 60_000,
  });
  if (isLoading) return <Skeleton className="h-40" />;
  if (error || !data) return <p className="text-sm text-danger">{errorMessage(error)}</p>;
  const rows = data.leads
    .map((r) => ({ ...r, issues: r.issues.filter((i) => filter === 'all' || i.field === filter) }))
    .filter((r) => r.issues.length);
  const count = (field: 'email' | 'phone') => data.leads.filter((r) => r.issues.some((i) => i.field === field)).length;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Mostrar" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              filter === f.value ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:text-fg',
            )}
          >
            {f.label}
            {f.value === 'all' ? ` (${data.leads.length})` : ` (${count(f.value)})`}
          </button>
        ))}
      </div>
      {data.domains_pending ? (
        <p className="text-xs text-muted">Ainda faltam verificar {data.domains_pending} domínios de email: volta a abrir esta página daqui a pouco para ver o resto.</p>
      ) : null}
      {rows.length === 0 ? (
        <Card>
          <EmptyState title="Nada a corrigir">
            {filter === 'all' ? 'Os emails e os telefones dos leads parecem estar bem.' : 'Nada a corrigir neste tipo de contacto.'}
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <ul aria-label="Leads com contactos a corrigir" className="flex flex-col">
            {rows.map(({ lead, issues }) => (
              <li key={lead.id} data-lead={lead.number} className="flex flex-col gap-1 border-t border-border px-4 py-3 first:border-t-0">
                <Link href={leadPath(lead)} className="font-medium text-accent-text hover:underline">
                  #{lead.number} {lead.company_name}
                </Link>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {issues.map((i, n) => (
                    <li key={n} className="flex items-start gap-1.5">
                      {i.field === 'email' ? <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> : <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
                      <span className="min-w-0 break-words">
                        {i.field === 'email' && lead.email ? <span className="text-muted">{lead.email} — </span> : null}
                        {i.other ? (
                          <>
                            O mesmo telefone que{' '}
                            <Link href={leadPath(i.other)} className="underline hover:text-fg">
                              #{i.other.number} {i.other.company_name}
                            </Link>
                            {/\(e mais \d+\)/.exec(i.message) ? ` ${/\(e mais \d+\)/.exec(i.message)![0]}` : ''}.
                          </>
                        ) : (
                          i.message
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
