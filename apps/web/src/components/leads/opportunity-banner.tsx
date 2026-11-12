'use client';

/**
 * Ficha de um lead (não cliente): o site dele tem um problema agora (em baixo, "Não seguro",
 * muito lento) — bom momento para contactar, com a mensagem já escrita (copiar, WhatsApp
 * ou email). Vem da vigilância dos sites dos leads quentes.
 */
import { formatDateTime, opportunityMessage, siteOpportunity, todayIso, type Lead } from '@vndesign/core';
import { Copy, MessageCircle, Target } from 'lucide-react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button, buttonClasses } from '@/components/ui/button';
import { useSettings, useSiteMonitor } from '@/lib/queries';
import { cn, displayHost, whatsappUrl } from '@/lib/utils';
import { SiteQuickActions } from './site-quick-actions';

export function OpportunityBanner({ lead, className }: { lead: Lead; className?: string }) {
  const { data: settings } = useSettings();
  const enabled = !!settings?.features.prospect_watch && !!settings.features.site_monitoring && lead.status !== 'cliente' && lead.status !== 'sem_interesse' && !lead.anonymized_at;
  const { data: monitor } = useSiteMonitor(lead.id, enabled);
  if (!enabled || !monitor) return null;
  const opportunity = siteOpportunity(monitor, todayIso());
  if (!opportunity) return null;
  const message = opportunityMessage(opportunity.kind, lead, displayHost(monitor.url));
  const wa = whatsappUrl(lead.phone, message.body.replace(/\n\nCumprimentos,$/, ''));

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.body);
      toast.success('Mensagem copiada.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <div role="status" aria-label="Oportunidade" className={cn('mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm', className)}>
      <Target className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">Oportunidade:</strong> {opportunity.label}
        {opportunity.kind === 'down' && monitor.down_since ? ` desde ${formatDateTime(monitor.down_since)}` : ''}. Bom momento para contactar.
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar mensagem
        </Button>
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm')}>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
          </a>
        ) : null}
        {lead.email ? <SendEmailButton lead={lead} subject={message.subject} body={message.body} template="Oportunidade (site)" label="Email" size="sm" variant="outline" /> : null}
        {/* Antes de contactar: confirmar que o problema ainda existe (ou dizer que é falso alarme). */}
        <SiteQuickActions monitor={monitor} />
      </span>
    </div>
  );
}
