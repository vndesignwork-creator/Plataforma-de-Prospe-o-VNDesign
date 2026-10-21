'use client';

/**
 * Temporizador a contar, sempre à vista (menu lateral e barra do telemóvel):
 * o projeto, o tempo total do projeto e o botão para pausar.
 */
import { formatClock, formatDuration, leadPath } from '@vndesign/core';
import { Pause } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api-client';
import { useRunningTimer, useSettings, useTimer } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useElapsed } from './time-section';

export function RunningTimer({ compact, className }: { compact?: boolean; className?: string }) {
  const { data: settings } = useSettings();
  const enabled = !!settings?.features.projects && !!settings.features.time_tracking;
  const { data: running } = useRunningTimer(enabled);
  const timer = useTimer();
  const elapsed = useElapsed(running?.entry.started_at ?? null);
  if (!enabled || !running) return null;
  // Total do projeto (o já registado + esta sessão), como no botão do projeto.
  const total = running.logged_seconds + Math.floor(elapsed);

  async function stop() {
    try {
      await timer.mutateAsync({ leadId: running!.lead.id, start: false });
      toast.success(`Em pausa. Total registado: ${formatDuration(total)}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div
      role="status"
      aria-label={`Temporizador a contar: ${running.lead.company_name}, total ${formatClock(total)}`}
      className={cn('flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-2 py-1.5 text-sm', className)}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        {!compact ? (
          <Link href={`${leadPath(running.lead)}#projeto`} className="block truncate text-xs text-muted hover:text-fg hover:underline">
            {running.lead.company_name}
          </Link>
        ) : null}
        <span className="font-semibold tabular text-accent-text">{formatClock(total)}</span>
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={timer.isPending}
        className="rounded-md p-1.5 text-accent-text hover:bg-accent-soft disabled:opacity-50 pointer-coarse:p-2"
        aria-label={`Pausar o temporizador de ${running.lead.company_name}`}
        title="Pausar"
      >
        <Pause className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
