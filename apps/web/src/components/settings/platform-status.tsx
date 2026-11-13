'use client';

/**
 * Estado da plataforma: as tarefas automáticas (cron do hPanel) e os problemas em segundo
 * plano. Também a faixa do Dashboard quando as tarefas automáticas param (dono e administradores).
 */
import { PROBLEM_AREA_LABELS, formatDateTime, type CronState, type PlatformStatus } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { useRole } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function usePlatformStatus(enabled = true) {
  return useQuery({
    queryKey: ['platform-status'],
    queryFn: () => api<{ data: PlatformStatus }>('/platform/status').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** "há 3 min" / "há 2 h" / "há 3 dias". */
function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

const CRON_TEXT: Record<CronState, { label: string; tone: string }> = {
  ok: { label: 'A correr', tone: 'text-success' },
  late: { label: 'Parado', tone: 'text-danger font-medium' },
  never: { label: 'Ainda não correu', tone: 'text-warning font-medium' },
};

/** Faixa no Dashboard: só quando as tarefas automáticas já correram e pararam. */
export function PlatformHealthBanner() {
  const role = useRole();
  const staff = role === 'owner' || role === 'admin';
  const { data } = usePlatformStatus(staff);
  if (!staff || !data) return null;
  const stopped = data.reminders === 'late' ? data.reminders_at : data.digest === 'late' ? data.digest_at : null;
  if (!stopped) return null;
  return (
    <p role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
      <span>
        <strong className="font-semibold">As tarefas automáticas não correm {ago(stopped)}.</strong>{' '}
        {data.reminders === 'late' ? 'Os lembretes, a verificação dos sites e a leitura dos emails estão parados.' : 'O resumo diário e as cópias de segurança estão parados.'}
      </span>
      <Link href="/definicoes/estado" className="ml-auto font-medium text-accent-text underline">
        Ver o que fazer
      </Link>
    </p>
  );
}

function CronRow({ name, what, schedule, state, at }: { name: string; what: string; schedule: string; state: CronState; at: string | null }) {
  const meta = CRON_TEXT[state];
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-0.5 border-t border-border py-2 first:border-t-0">
      {state === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <Clock className={cn('mt-0.5 h-4 w-4 shrink-0', state === 'late' ? 'text-danger' : 'text-warning')} aria-hidden />}
      <span className="min-w-0 flex-1 basis-48">
        <span className="block font-medium">{name}</span>
        <span className="block text-xs text-muted">
          {what} · {schedule}
        </span>
      </span>
      {/* Telemóvel: o estado passa para baixo do nome (o texto não fica numa coluna estreita). */}
      <span className="text-right text-sm max-sm:basis-full max-sm:pl-7 max-sm:text-left">
        <span className={cn('block', meta.tone)}>{meta.label}</span>
        <span className="block text-xs text-muted">{at ? `Última vez ${ago(at)} (${formatDateTime(at)})` : 'Nunca'}</span>
      </span>
    </li>
  );
}

export function PlatformStatusView() {
  const qc = useQueryClient();
  const { data, isLoading, error } = usePlatformStatus();
  async function resolve(id: string) {
    try {
      await api(`/platform/problems/${id}/resolve`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['platform-status'] });
      toast.success('Marcado como resolvido.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  if (isLoading) return <Skeleton className="h-40" />;
  if (error || !data) return <p className="text-sm text-danger">{errorMessage(error)}</p>;
  const open = data.problems.filter((p) => !p.resolved_at);
  const resolved = data.problems.filter((p) => p.resolved_at);
  const cronBad = data.reminders !== 'ok' || data.digest !== 'ok';
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Tarefas automáticas" description="O que a plataforma faz sozinha, chamada pelas tarefas agendadas (cron) do hPanel." />
        <div className="px-4 pb-4">
          <ul aria-label="Tarefas automáticas" className="flex flex-col">
            <CronRow
              name="Lembretes e verificações"
              what="Lembretes das tarefas, verificação dos sites, respostas dos leads, pesquisas automáticas"
              schedule="de 5 em 5 minutos"
              state={data.reminders}
              at={data.reminders_at}
            />
            <CronRow
              name="Resumo diário"
              what="Resumo por email, cópia de segurança, renovações, follow-ups da análise grátis"
              schedule="uma vez por dia"
              state={data.digest}
              at={data.digest_at}
            />
          </ul>
          {cronBad ? (
            <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <p className="font-medium">O que fazer</p>
              <ol className="mt-1 list-decimal pl-5 text-muted">
                <li>No hPanel, abre Websites → leads.vndesign.pt → Avançado → Tarefas Cron.</li>
                <li>Confirma que estão lá as duas tarefas (os lembretes de 5 em 5 minutos e o resumo diário) e que estão ativas.</li>
                <li>Se faltar alguma, volta a criá-la como estava (o endereço e o CRON_SECRET estão no guia de instalação).</li>
              </ol>
              <p className="mt-1 text-xs text-muted">
                Quando param, avisamos no sino{data.mail_configured ? ' e por email' : ''} (uma vez por paragem).
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Problemas" description="O que falhou em segundo plano nos últimos 30 dias (os repetidos juntam-se)." />
        <div className="px-4 pb-4">
          {open.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Nenhum problema por resolver.
            </p>
          ) : (
            <ul aria-label="Problemas por resolver" className="flex flex-col">
              {open.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 basis-60">
                    <span className="block font-medium break-words">{p.title}</span>
                    {p.detail ? <span className="block text-sm break-words text-muted">{p.detail}</span> : null}
                    <span className="block text-xs text-muted">
                      {PROBLEM_AREA_LABELS[p.area] ?? p.area} · {p.count === 1 ? '1 vez' : `${p.count} vezes`} · última {ago(p.last_at)}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => void resolve(p.id)}>
                    Já resolvi
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {resolved.length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted">Resolvidos ({resolved.length})</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {resolved.map((p) => (
                  <li key={p.id} className="text-muted">
                    {p.title} · {formatDateTime(p.resolved_at!)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

/** O estado na página inicial das Definições. */
export function platformBadge(data: PlatformStatus | undefined): { text: string; tone?: 'success' | 'warning' | 'danger' } | null {
  if (!data) return null;
  if (data.reminders === 'late' || data.digest === 'late') return { text: 'Tarefas paradas', tone: 'danger' };
  const open = data.problems.filter((p) => !p.resolved_at).length;
  if (open) return { text: `${open} ${open === 1 ? 'problema' : 'problemas'}`, tone: 'warning' };
  if (data.reminders === 'never') return { text: 'Cron por ligar', tone: 'warning' };
  return { text: 'Tudo bem', tone: 'success' };
}
