'use client';

/**
 * Prioridade do lead (0–100, calculada pela base de dados) como "Quente 72", com
 * um ícone de linha (chama, sol, floco de neve) como os do resto da plataforma.
 * Na ficha, um toque mostra as razões; nas listas, ficam na dica (title).
 */
import * as Popover from '@radix-ui/react-popover';
import { LEAD_TEMPERATURE_META, leadTemperature, type Lead, type LeadTemperature } from '@vndesign/core';
import { Flame, Snowflake, Sun, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONES = {
  hot: 'bg-accent-soft text-accent-text',
  warm: 'bg-warning-soft text-warning',
  cold: 'bg-surface-3 text-muted',
} as const;

const ICONS: Record<LeadTemperature, LucideIcon> = { hot: Flame, warm: Sun, cold: Snowflake };

type ScoreLead = Pick<Lead, 'score' | 'score_reasons' | 'status'>;

const closed = (lead: ScoreLead) => lead.status === 'cliente' || lead.status === 'sem_interesse' || lead.status === 'em_pausa';

function reasonsText(lead: ScoreLead) {
  return lead.score_reasons?.length ? lead.score_reasons.join(' · ') : 'Sem fatores a favor.';
}

/** Distintivo compacto (listas): ícone + "72". */
export function LeadScoreBadge({ lead, className, showLabel }: { lead: ScoreLead; className?: string; showLabel?: boolean }) {
  if (lead.score === undefined || closed(lead)) return null;
  const t = leadTemperature(lead.score);
  const meta = LEAD_TEMPERATURE_META[t];
  const Icon = ICONS[t];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap tabular', TONES[t], className)}
      title={`Prioridade ${lead.score}/100 (${meta.label}): ${reasonsText(lead)}`}
      aria-label={`Prioridade ${lead.score} de 100, ${meta.label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {showLabel ? `${meta.label} · ` : null}
      {lead.score}
    </span>
  );
}

/** Na ficha: botão com as razões da pontuação. */
export function LeadScoreDetails({ lead }: { lead: ScoreLead }) {
  if (lead.score === undefined || closed(lead)) return null;
  const t = leadTemperature(lead.score);
  const meta = LEAD_TEMPERATURE_META[t];
  const Icon = ICONS[t];
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular',
          'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
          TONES[t],
        )}
        aria-label={`${meta.label} · ${lead.score}: prioridade ${lead.score} de 100. Ver porquê`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {meta.label} · {lead.score}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border-strong bg-surface-2 p-3 text-sm shadow-card"
        >
          <p className="font-medium">Prioridade {lead.score} de 100</p>
          <p className="mb-2 text-xs text-muted">Quanto maior, mais vale a pena contactar agora. Atualiza-se sozinha.</p>
          {lead.score_reasons?.length ? (
            <ul className="list-disc space-y-0.5 pl-5">
              {lead.score_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Ainda sem fatores a favor (ex.: analisa o site ou junta o email).</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
