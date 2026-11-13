'use client';

/**
 * Leads → Contactos a corrigir: emails que voltaram para trás ou de domínios que não recebem
 * emails, telefones com dígitos a mais ou a menos, e o mesmo telefone em leads diferentes.
 */
import { leadPath, type ContactFormatChange, type ContactIssues } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

/** "Arrumar formatos": todos os telefones como +351 912 345 678 e os emails em minúsculas, com "Anular". */
function TidyFormats() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ['contact-format'],
    queryFn: () => api<{ data: ContactFormatChange[] }>('/leads/contact-format').then((r) => r.data),
  });
  if (!data?.length) return null;
  const leads = new Set(data.map((c) => c.id)).size;
  const refresh = () => {
    for (const key of ['contact-format', 'contact-issues', 'leads', 'lead', 'lead-bundle']) void qc.invalidateQueries({ queryKey: [key] });
  };
  const payload = (pick: 'from' | 'to') => {
    const byId = new Map<string, { id: string; phone?: string; email?: string }>();
    for (const c of data) byId.set(c.id, { ...(byId.get(c.id) ?? { id: c.id }), [c.field]: c[pick] });
    return [...byId.values()];
  };
  async function tidy() {
    setBusy(true);
    const undo = payload('from');
    try {
      const r = await api<{ data: { changed: number } }>('/leads/contact-format', { method: 'POST', body: { items: payload('to') } });
      refresh();
      toast.success(`Arrumados os contactos de ${r.data.changed} ${r.data.changed === 1 ? 'lead' : 'leads'}.`, {
        action: {
          label: 'Anular',
          onClick: () =>
            void api('/leads/contact-format', { method: 'POST', body: { items: undo } })
              .then(refresh)
              .catch((e) => toast.error(errorMessage(e))),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Wand2 className="h-4 w-4 text-accent-text" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong className="font-medium">{data.length} contactos</strong> de {leads} {leads === 1 ? 'lead podem' : 'leads podem'} ficar no mesmo formato (telefones como +351 912 345 678, emails em
          minúsculas).
        </span>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Esconder' : 'Ver o que muda'}
        </Button>
        <Button size="sm" onClick={() => void tidy()} loading={busy}>
          Arrumar formatos
        </Button>
      </div>
      {open ? (
        <ul aria-label="O que muda" className="flex max-h-72 flex-col gap-0.5 overflow-y-auto text-xs">
          {data.slice(0, 200).map((c) => (
            <li key={`${c.id}-${c.field}`} className="break-words">
              <span className="font-medium">#{c.number} {c.company_name}</span>: <span className="text-muted line-through">{c.from}</span> → {c.to}
            </li>
          ))}
          {data.length > 200 ? <li className="text-muted">e mais {data.length - 200}…</li> : null}
        </ul>
      ) : null}
    </Card>
  );
}

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
      <TidyFormats />
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
