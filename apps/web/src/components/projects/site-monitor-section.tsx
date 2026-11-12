'use client';

/**
 * Site do cliente: vigiar se está no ar (de hora a hora), o certificado SSL e o domínio.
 * Avisa (sino + tarefa) antes de expirarem e quando o site vai abaixo. Sem a data do
 * domínio pela consulta pública, pode escrever-se à mão. Se houver a renovação do
 * domínio em "Renovações e avenças", mostra essa data (e o aviso fica com as renovações).
 */
import {
  downMuted,
  formatDate,
  formatDateTime,
  formatDowntime,
  formatUptime,
  monthLabel,
  recentMonths,
  siteIssues,
  todayIso,
  type Lead,
  type SiteMonitor,
  type SiteMonitorHistory,
} from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CalendarClock, FileText, Globe, Lock, MoreHorizontal, Pause, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useSiteMonitor, useSiteMonitorActions } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { SiteQuickActions } from '@/components/leads/site-quick-actions';
import { SectionHeader } from './section-header';

type Monitor = SiteMonitor & { domain_renewal_on: string | null };

/** O estado em poucas palavras (para o cabeçalho). */
function statusLabel(m: Monitor, today: string): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (!m.active) return { text: 'Em pausa', tone: 'muted' };
  if (m.is_up === null && !m.checked_at) return { text: 'A verificar…', tone: 'muted' };
  const issues = siteIssues(m, today, m.domain_renewal_on ?? m.domain_expires_on);
  if (issues.some((i) => i.severity === 'danger')) return { text: issues.find((i) => i.severity === 'danger')!.label, tone: 'bad' };
  if (issues.length) return { text: issues[0]!.label, tone: 'warn' };
  if (m.fail_count > 0) return { text: 'Não respondeu (a confirmar)', tone: 'warn' };
  return { text: 'No ar', tone: 'ok' };
}

function DomainForm({ monitor, onDone }: { monitor: Monitor; onDone: () => void }) {
  const actions = useSiteMonitorActions(monitor.lead_id);
  const [value, setValue] = useState(monitor.domain_expires_on ?? '');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await actions.update.mutateAsync({ id: monitor.id, domain_expires_on: value || null });
      toast.success(value ? `Domínio: expira a ${formatDate(value)}.` : 'A data do domínio volta a ser consultada.');
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Expira a</span>
        <DateInput value={value} onChange={setValue} aria-label="Data em que o domínio expira" className="w-44" />
      </label>
      <p className="basis-full text-xs text-muted sm:order-last">Está no painel onde o domínio foi registado (ex.: PTisp, Amen, GoDaddy). Vazio = voltar a consultar sozinho.</p>
      <Button type="submit" size="sm" loading={actions.update.isPending}>
        Guardar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancelar
      </Button>
    </form>
  );
}

function UrlForm({ lead, monitor, onDone }: { lead: Lead; monitor?: Monitor; onDone: () => void }) {
  const actions = useSiteMonitorActions(lead.id);
  const [url, setUrl] = useState(monitor?.url ?? lead.website ?? '');
  const busy = actions.create.isPending || actions.update.isPending;
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const saved = monitor
        ? await actions.update.mutateAsync({ id: monitor.id, url: url.trim() })
        : await actions.create.mutateAsync(url.trim() ? { url: url.trim() } : {});
      toast.success(saved.is_up === false || saved.fail_count > 0 ? 'A vigiar. O site não respondeu agora — volta a ser visto daqui a 5 minutos.' : 'A vigiar o site: avisa se for abaixo ou antes de expirar.');
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cliente.pt" aria-label="Endereço do site a vigiar" className="min-w-0 flex-1 basis-56" autoFocus />
      <Button type="submit" size="sm" loading={busy}>
        {monitor ? 'Guardar' : 'Começar a vigiar'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancelar
      </Button>
    </form>
  );
}

const dayTone = (v: number | null) => (v === null ? 'bg-border' : v >= 99.9 ? 'bg-success' : v >= 98 ? 'bg-warning' : 'bg-danger');

/**
 * Os últimos 30 dias (tempo no ar, quebras, tempo de resposta, uma barra por dia) e o
 * relatório do mês em PDF para enviar ao cliente.
 */
function SiteHistory({ monitor }: { monitor: Monitor }) {
  const today = todayIso();
  const months = recentMonths(today, 12);
  // Nos primeiros dias do mês, o relatório que interessa é o do mês que acabou.
  const [month, setMonth] = useState(Number(today.slice(8, 10)) <= 7 ? months[1]! : months[0]!);
  const { data, isLoading, error } = useQuery({
    queryKey: ['site-monitor-history', monitor.id],
    queryFn: () => api<{ data: SiteMonitorHistory }>(`/site-monitors/${monitor.id}/history`, { query: { days: 30 } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-medium text-muted">Últimos 30 dias</span>
        {isLoading ? (
          <Skeleton className="h-4 w-48" />
        ) : error ? (
          <span className="text-xs text-danger">{errorMessage(error)}</span>
        ) : data && data.uptime_pct !== null ? (
          <span data-testid="site-uptime">
            <strong className="font-semibold">{formatUptime(data.uptime_pct)} no ar</strong>
            {' · '}
            {data.incidents.length === 0
              ? 'sem quebras'
              : `${data.incidents.length} ${data.incidents.length === 1 ? 'quebra' : 'quebras'} (${formatDowntime(data.down_minutes)})`}
            {data.avg_response_ms !== null ? ` · abre em ${(data.avg_response_ms / 1000).toFixed(1).replace('.', ',')} s` : ''}
          </span>
        ) : (
          <span className="text-xs text-muted">Ainda sem histórico (começa a contar a partir de agora).</span>
        )}
      </div>
      {data && data.uptime_pct !== null ? (
        <div
          className="flex h-6 items-end gap-px"
          role="img"
          aria-label={`Dia a dia, últimos 30 dias: ${data.days.filter((d) => d.uptime_pct !== null && d.uptime_pct < 100).length} dias com quebras`}
        >
          {data.days.slice(-30).map((d) => (
            <span
              key={d.day}
              title={`${formatDate(d.day)}: ${d.uptime_pct === null ? 'sem dados' : `${formatUptime(d.uptime_pct)} no ar`}`}
              className={cn('flex-1 rounded-sm', dayTone(d.uptime_pct), d.uptime_pct === null ? 'h-1.5' : 'h-full')}
            />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês do relatório do site" className="h-8 w-auto text-sm">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
        <a href={`/api/v1/site-monitors/${monitor.id}/report?month=${month}`} className={buttonClasses('outline', 'sm')} download>
          <FileText className="h-3.5 w-3.5" aria-hidden /> Relatório para o cliente (PDF)
        </a>
      </div>
    </div>
  );
}

function MonitorDetails({ lead, monitor }: { lead: Lead; monitor: Monitor }) {
  const actions = useSiteMonitorActions(lead.id);
  const queryClient = useQueryClient();
  const [editingDomain, setEditingDomain] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const today = todayIso();
  const issues = siteIssues(monitor, today, monitor.domain_renewal_on ?? monitor.domain_expires_on);
  const sslDay = monitor.ssl_expires_at?.slice(0, 10) ?? null;
  const domainDay = monitor.domain_renewal_on ?? monitor.domain_expires_on;
  const tone = (kinds: string[]) => {
    const issue = issues.find((i) => kinds.includes(i.kind));
    return issue ? (issue.severity === 'danger' ? 'text-danger font-medium' : 'text-warning font-medium') : 'text-muted';
  };

  async function checkNow() {
    try {
      const m = await actions.check.mutateAsync(monitor.id);
      void queryClient.invalidateQueries({ queryKey: ['site-monitor-history', monitor.id] });
      toast.success(m.fail_count > 0 ? `Não respondeu: ${m.error ?? 'sem resposta'}` : `No ar${m.response_ms ? ` (respondeu em ${(m.response_ms / 1000).toFixed(1).replace('.', ',')} s)` : ''}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (editingUrl) return <UrlForm lead={lead} monitor={monitor} onDone={() => setEditingUrl(false)} />;
  return (
    <div className={cn('mt-2 flex flex-col gap-2 text-sm', !monitor.active && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a href={monitor.url} target="_blank" rel="noopener noreferrer" className="min-w-0 font-medium break-all text-accent-text hover:underline">
          {displayHost(monitor.url)}
        </a>
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void checkNow()} loading={actions.check.isPending}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Verificar agora
          </Button>
          <SiteQuickActions monitor={monitor} check={false} />
          <DropdownRoot>
            <DropdownTrigger className={buttonClasses('ghost', 'icon', 'h-8 w-8')} aria-label="Mais ações do site">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem onSelect={() => setEditingUrl(true)}>
                <Pencil className="h-4 w-4" aria-hidden /> Mudar o endereço
              </DropdownItem>
              <DropdownItem onSelect={() => setEditingDomain(true)}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Data do domínio à mão
              </DropdownItem>
              <DropdownItem onSelect={() => actions.update.mutate({ id: monitor.id, active: !monitor.active }, { onError: (e) => toast.error(errorMessage(e)) })}>
                {monitor.active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {monitor.active ? 'Pausar (sem avisos)' : 'Retomar'}
              </DropdownItem>
              <DropdownItem
                danger
                onSelect={() => {
                  if (window.confirm('Deixar de vigiar este site?')) actions.remove.mutate(monitor.id, { onError: (e) => toast.error(errorMessage(e)) });
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Deixar de vigiar
              </DropdownItem>
            </DropdownContent>
          </DropdownRoot>
        </span>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-3">
        <li className="flex items-start gap-1.5">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span>
            <span className="block text-xs text-muted">No ar</span>
            <span className={tone(['down'])}>
              {monitor.down_since
                ? `Em baixo desde ${formatDateTime(monitor.down_since)}`
                : monitor.is_up === null && !monitor.checked_at
                  ? 'A verificar…'
                  : monitor.fail_count > 0
                    ? 'Não respondeu (a confirmar)'
                    : `Sim${monitor.response_ms ? ` · ${(monitor.response_ms / 1000).toFixed(1).replace('.', ',')} s` : ''}`}
            </span>
            {monitor.checked_at ? <span className="block text-xs text-muted">Visto {formatDateTime(monitor.checked_at)}</span> : null}
            {downMuted(monitor) ? (
              <span className="block text-xs text-muted">
                Falso alarme: sem avisos de “em baixo” até {formatDate(monitor.down_muted_until!.slice(0, 10))} ·{' '}
                <button
                  type="button"
                  className="underline hover:text-fg"
                  onClick={() => actions.update.mutate({ id: monitor.id, false_alarm: false }, { onError: (e) => toast.error(errorMessage(e)) })}
                >
                  Voltar a avisar
                </button>
              </span>
            ) : null}
          </span>
        </li>
        <li className="flex items-start gap-1.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span>
            <span className="block text-xs text-muted">Certificado SSL</span>
            <span className={tone(['ssl_expired', 'ssl_soon', 'ssl_error'])}>
              {sslDay ? `Até ${formatDate(sslDay)}` : monitor.url.startsWith('https:') ? (monitor.checked_at ? 'Sem dados' : '—') : 'Sem https'}
            </span>
            {monitor.ssl_error ? <span className="block text-xs text-warning">{monitor.ssl_error}</span> : null}
          </span>
        </li>
        <li className="flex items-start gap-1.5">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span>
            <span className="block text-xs text-muted">Domínio</span>
            <span className={tone(['domain_expired', 'domain_soon'])}>{domainDay ? `Até ${formatDate(domainDay)}` : 'Data desconhecida'}</span>
            <span className="block text-xs text-muted">
              {monitor.domain_renewal_on
                ? 'Pela renovação registada'
                : monitor.domain_source === 'manual'
                  ? 'Escrita à mão'
                  : monitor.domain_source === 'rdap'
                    ? 'Consulta pública'
                    : (
                        <button type="button" onClick={() => setEditingDomain(true)} className="underline hover:text-fg">
                          Escrever a data
                        </button>
                      )}
            </span>
          </span>
        </li>
      </ul>
      {editingDomain ? <DomainForm monitor={monitor} onDone={() => setEditingDomain(false)} /> : null}
      <SiteHistory monitor={monitor} />
    </div>
  );
}

export function SiteMonitorSection({ lead }: { lead: Lead }) {
  const { data: monitor, isLoading } = useSiteMonitor(lead.id);
  const [adding, setAdding] = useState(false);
  const today = todayIso();
  const status = monitor ? statusLabel(monitor, today) : null;
  return (
    <section aria-labelledby={`site-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`site-${lead.id}`}
        icon={Activity}
        title="Site do cliente"
        summary={
          status ? (
            <span className={cn(status.tone === 'ok' && 'text-success', status.tone === 'warn' && 'text-warning', status.tone === 'bad' && 'font-medium text-danger')}>
              {status.tone === 'ok' ? '● ' : status.tone === 'bad' ? '● ' : ''}
              {status.text}
            </span>
          ) : null
        }
        action={
          monitor || adding ? null : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Activity className="h-3.5 w-3.5" aria-hidden /> Vigiar o site
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-full" />
      ) : monitor ? (
        <MonitorDetails lead={lead} monitor={monitor} />
      ) : adding ? (
        <UrlForm lead={lead} onDone={() => setAdding(false)} />
      ) : (
        <p className="mt-1 text-sm text-muted">Avisa se o site for abaixo e antes de o certificado SSL ou o domínio expirarem (com uma tarefa).</p>
      )}
    </section>
  );
}
