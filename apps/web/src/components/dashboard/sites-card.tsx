'use client';

/**
 * Dashboard: os sites dos clientes com problemas (em baixo, certificado SSL ou domínio a
 * expirar). Sem problemas, não aparece (os avisos e as tarefas chegam na mesma).
 */
import { formatDate, leadPath, siteIssues, todayIso } from '@vndesign/core';
import { Activity } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { useSettings, useSiteMonitors } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { SiteQuickActions } from '@/components/leads/site-quick-actions';

export function SitesCard({ className }: { className?: string }) {
  const { data: settings } = useSettings();
  const enabled = settings?.features.site_monitoring !== false && settings?.features.projects !== false;
  const { data } = useSiteMonitors(enabled);
  if (!enabled || !data) return null;
  const today = todayIso();
  const rows = data
    .filter((m) => m.active)
    .map((m) => ({ m, issues: siteIssues(m, today, m.domain_renewal_on ?? m.domain_expires_on) }))
    .filter((r) => r.issues.length)
    .sort((a, b) => Number(b.issues[0]!.severity === 'danger') - Number(a.issues[0]!.severity === 'danger'));
  if (!rows.length) return null;
  return (
    <Card className={className}>
      {/* Clientes e os leads quentes vigiados sozinhos (cada linha diz qual é). */}
      <CardHeader title="Sites vigiados" description={`${rows.length} com problemas · ${data.filter((m) => m.active).length} vigiados`} />
      <ul className="divide-y divide-border">
        {rows.slice(0, 6).map(({ m, issues }) => (
          <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
            <Activity className={cn('mt-0.5 h-4 w-4 shrink-0', issues[0]!.severity === 'danger' ? 'text-danger' : 'text-warning')} aria-hidden />
            <span className="min-w-0 flex-1">
              {/* Cliente: abre o projeto (onde está o site vigiado); lead: a ficha, onde está o aviso "Oportunidade". */}
              <Link href={`${leadPath(m.lead)}${m.lead.status === 'cliente' ? '#projeto' : ''}`} className="font-medium hover:underline">
                #{m.lead.number} {m.lead.company_name}
              </Link>
              <span
                className={cn(
                  'ml-1.5 inline-flex rounded px-1.5 align-middle text-xs',
                  m.lead.status === 'cliente' ? 'bg-success-soft text-success' : 'bg-info-soft text-info',
                )}
              >
                {m.lead.status === 'cliente' ? 'Cliente' : 'Lead'}
              </span>
              <span className="text-muted"> · {displayHost(m.url)}</span>
              <span className="block text-xs">
                {issues.map((i, n) => (
                  <span key={i.kind} className={i.severity === 'danger' ? 'font-medium text-danger' : 'text-warning'}>
                    {n ? ' · ' : ''}
                    {i.label}
                    {i.date && i.kind !== 'down' && !i.label.includes('expira em') ? ` (${formatDate(i.date)})` : ''}
                  </span>
                ))}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
              <SiteQuickActions monitor={m} label={m.lead.company_name} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
