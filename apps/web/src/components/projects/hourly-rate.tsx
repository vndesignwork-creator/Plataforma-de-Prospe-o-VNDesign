'use client';

/**
 * O teu valor por hora: converte o tempo registado (horas, cronómetro,
 * Pomodoro) em dinheiro. É o mesmo valor da calculadora de orçamento
 * (settings.quote.hourly_target); o prospetor não vê valores.
 */
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency, parseEuroAmount, timeValue } from '@vndesign/core';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useRole, useSettings, type SettingsWithMail } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** null = sem valor por hora, funcionalidade desligada ou quem está a ver não vê valores. */
export function useHourlyRate(): { rate: number | null; canSee: boolean } {
  const { data: settings } = useSettings();
  // Desligado em Definições → Funcionalidades → Tempo em dinheiro (ou o prospetor, que não vê valores).
  const canSee = useRole() !== 'prospector' && settings?.features.time_value !== false;
  return { rate: canSee ? (settings?.quote.hourly_target ?? null) : null, canSee };
}

/** "8,21 €": quanto vale este tempo (nada sem valor por hora). */
export function TimeMoney({ seconds, className, prefix = '' }: { seconds: number; className?: string; prefix?: string }) {
  const { rate } = useHourlyRate();
  const value = timeValue(seconds, rate);
  if (value === null) return null;
  return (
    <span className={cn('tabular', className)} title={`A ${formatCurrency(rate)} por hora`}>
      {prefix}
      {formatCurrency(value)}
    </span>
  );
}

/** "a 35 €/h ✎" (ou "Definir valor por hora"): abre a janela para o mudar. */
export function HourlyRateButton({ className }: { className?: string }) {
  const { rate, canSee } = useHourlyRate();
  const [open, setOpen] = useState(false);
  if (!canSee) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1 text-xs text-muted hover:text-fg', className)}
        aria-label={rate ? `Valor por hora: ${formatCurrency(rate)}. Alterar` : 'Definir o teu valor por hora'}
      >
        {rate ? `a ${formatCurrency(rate, { decimals: false })}/h` : 'Definir valor por hora'}
        <Pencil className="h-3 w-3" aria-hidden />
      </button>
      {open ? <HourlyRateDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Guarda o valor por hora (o mesmo da calculadora de orçamento). */
export function useSaveHourlyRate() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  return async (rate: number | null) => {
    if (!settings) return;
    const { data } = await api<{ data: SettingsWithMail }>('/settings', {
      method: 'PATCH',
      body: { quote: { ...settings.quote, hourly_target: rate } },
    });
    qc.setQueryData(['settings'], data);
  };
}

export function HourlyRateDialog({ onClose }: { onClose: () => void }) {
  const { rate } = useHourlyRate();
  const save = useSaveHourlyRate();
  const [value, setValue] = useState(rate !== null ? String(rate).replace('.', ',') : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = value.trim() ? parseEuroAmount(value) : null;
    if (value.trim() && (parsed === null || parsed < 0 || parsed > 1000)) {
      setError('Indica um valor entre 0 e 1000 €.');
      return;
    }
    setSaving(true);
    try {
      await save(parsed);
      toast.success(parsed ? `Valor por hora: ${formatCurrency(parsed)}.` : 'Valor por hora apagado.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="O teu valor por hora"
      description="Converte o tempo registado (horas, cronómetro e Pomodoro) em dinheiro. É também o objetivo da calculadora de orçamento."
      className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="hourly-rate" loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="hourly-rate" onSubmit={submit} noValidate>
        <Field label="Valor por hora (€)" hint="Vazio = não converter o tempo em dinheiro." error={error ?? undefined}>
          <Input inputMode="decimal" placeholder="35" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}
