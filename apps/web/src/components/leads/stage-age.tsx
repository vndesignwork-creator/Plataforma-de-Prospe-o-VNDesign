'use client';

/**
 * Há quanto tempo está na fase atual ("há 12 dias"), a partir da última mudança
 * de estado. Mais de 14 dias fica a laranja (parado). Kanban e ficha.
 */
import { todayIso } from '@vndesign/core';
import { Hourglass } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export const STALE_DAYS = 14;

export function daysInStage(since: string, today: string): number {
  const start = todayIso(new Date(since));
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000));
}

export function stageAgeLabel(days: number): string {
  if (days === 0) return 'desde hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
}

export function StageAge({ since, compact, className }: { since: string; compact?: boolean; className?: string }) {
  const [today] = useState(() => todayIso());
  const days = daysInStage(since, today);
  const stale = days > STALE_DAYS;
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular', stale ? 'text-warning' : 'text-muted', compact && 'text-[11px]', className)}
      title={stale ? `Parado: nesta fase ${stageAgeLabel(days)}` : `Nesta fase ${stageAgeLabel(days)}`}
    >
      <Hourglass className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {compact ? (days === 0 ? 'hoje' : `${days} d`) : stageAgeLabel(days)}
      {compact ? <span className="sr-only">{` nesta fase${stale ? ' (parado)' : ''}`}</span> : null}
    </span>
  );
}
