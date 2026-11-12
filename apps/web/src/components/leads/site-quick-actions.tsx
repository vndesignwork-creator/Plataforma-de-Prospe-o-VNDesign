'use client';

/**
 * Ações rápidas de um site vigiado: "Verificar agora" e, quando aparece em baixo,
 * "Falso alarme" (o site está no ar: tira o aviso e não volta a dá-lo como em baixo
 * durante uns dias). Na ficha do lead (aviso "Oportunidade"), no cartão do Dashboard
 * e no projeto do cliente.
 */
import { FALSE_ALARM_DAYS, type SiteMonitor } from '@vndesign/core';
import { BellOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { useSiteMonitorActions } from '@/lib/queries';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

export function SiteQuickActions({
  monitor,
  check = true,
  label,
}: {
  monitor: Pick<SiteMonitor, 'id' | 'lead_id' | 'down_since'>;
  /** Mostrar "Verificar agora" (no projeto já existe ao lado). */
  check?: boolean;
  /** Para o nome acessível dos botões quando há vários na mesma lista (ex.: o nome do lead). */
  label?: string;
}) {
  const actions = useSiteMonitorActions(monitor.lead_id);
  const of = label ? ` — ${label}` : '';

  async function checkNow() {
    try {
      const m = await actions.check.mutateAsync(monitor.id);
      if (m.down_since) toast.error(`Continua em baixo: ${m.error ?? 'sem resposta'}`);
      else if (m.fail_count > 0) toast.warning(`Não respondeu agora (${m.error ?? 'sem resposta'}). Volta a ser visto daqui a 5 minutos.`);
      else toast.success(`O site está no ar${m.response_ms ? ` (respondeu em ${seconds(m.response_ms)})` : ''}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function falseAlarm() {
    try {
      await actions.update.mutateAsync({ id: monitor.id, false_alarm: true });
      toast.success(`Aviso retirado. Durante ${FALSE_ALARM_DAYS} dias, este site não volta a ser dado como em baixo.`, {
        action: {
          label: 'Anular',
          onClick: () =>
            actions.update.mutate({ id: monitor.id, false_alarm: false }, { onError: (e) => toast.error(errorMessage(e)) }),
        },
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      {check ? (
        <Button size="sm" variant="outline" onClick={() => void checkNow()} loading={actions.check.isPending} aria-label={`Verificar agora${of}`}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Verificar agora
        </Button>
      ) : null}
      {monitor.down_since ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void falseAlarm()}
          loading={actions.update.isPending}
          title="O site está a funcionar: tirar o aviso"
          aria-label={`Falso alarme${of}`}
        >
          <BellOff className="h-3.5 w-3.5" aria-hidden /> Falso alarme
        </Button>
      ) : null}
    </>
  );
}
