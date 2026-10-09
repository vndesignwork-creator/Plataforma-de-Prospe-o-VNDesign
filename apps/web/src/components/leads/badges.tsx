import {
  LEAD_CHANNEL_META,
  LEAD_STATUS_META,
  MOBILE_STATUS_META,
  type LeadChannel,
  type LeadStatus,
  type MobileStatus,
} from '@vndesign/core';
import { cn } from '@/lib/utils';
import { ChannelIcon, MobileIcon, StatusIcon } from '@/components/icons/lead-icons';

/** Estado com ícone na cor do estado + texto (a cor nunca é a única pista — WCAG 1.4.1). */
export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const meta = LEAD_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function ChannelLabel({ channel }: { channel: LeadChannel | null }) {
  if (!channel) return <span className="text-muted">—</span>;
  const meta = LEAD_CHANNEL_META[channel];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <ChannelIcon channel={channel} className="text-muted" />
      {meta.label}
    </span>
  );
}

export function MobileLabel({ mobile }: { mobile: MobileStatus }) {
  if (mobile === 'desconhecido') return <span className="text-muted">—</span>;
  const meta = MOBILE_STATUS_META[mobile];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', mobile === 'nao' && 'text-danger', mobile === 'sim' && 'text-success')}>
      <MobileIcon mobile={mobile} />
      {meta.label}
    </span>
  );
}

/** PageSpeed com a escala do Google: 0–49 mau, 50–89 a melhorar, 90–100 bom. */
export function PageSpeedScore({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  const tone = value >= 90 ? 'text-success' : value >= 50 ? 'text-warning' : 'text-danger';
  const label = value >= 90 ? 'bom' : value >= 50 ? 'a melhorar' : 'fraco';
  return (
    <span className={cn('tabular font-semibold', tone)}>
      {value}
      <span className="sr-only"> ({label})</span>
    </span>
  );
}
