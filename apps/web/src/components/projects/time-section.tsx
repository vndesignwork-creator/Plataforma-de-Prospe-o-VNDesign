'use client';

/**
 * Registo de horas do projeto: temporizador ▶/⏸ (um de cada vez), registo à
 * mão e o valor ganho por hora (valor do projeto ÷ horas).
 */
import { formatClock, formatCurrency, formatDate, formatMinutes, todayIso, type Lead } from '@vndesign/core';
import { Clock, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useAddTime, useDeleteTime, useProjectTime, useTimer } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

/** Segundos desde `since`, atualizados a cada segundo (null = parado). */
export function useElapsed(since: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, (now - Date.parse(since)) / 1000) : 0;
}

/** ▶ Começar / ⏸ 0:12:34 — põe a contar ou para o temporizador deste projeto. */
export function TimerButton({ leadId, runningSince, size = 'sm', className }: { leadId: string; runningSince: string | null; size?: 'sm' | 'md'; className?: string }) {
  const timer = useTimer();
  const elapsed = useElapsed(runningSince);
  const running = !!runningSince;

  async function toggle() {
    try {
      const entry = await timer.mutateAsync({ leadId, start: !running });
      toast.success(running ? `Tempo registado: ${formatMinutes(entry?.minutes ?? 0)}.` : 'Temporizador a contar.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Button
      size={size}
      variant={running ? 'primary' : 'outline'}
      onClick={toggle}
      loading={timer.isPending}
      className={cn(running && 'tabular', className)}
      aria-label={running ? `Parar o temporizador (${formatClock(elapsed)})` : 'Começar a contar o tempo'}
    >
      {running ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
      {running ? formatClock(elapsed) : 'Começar'}
    </Button>
  );
}

function TimeDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const add = useAddTime(lead.id);
  const [form, setForm] = useState({ date: todayIso(), hours: '1', minutes: '0', notes: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const minutes = Number(form.hours || 0) * 60 + Number(form.minutes || 0);
    try {
      await add.mutateAsync({ date: form.date, minutes: Math.round(minutes), notes: form.notes });
      toast.success(`${formatMinutes(minutes)} registados.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Registar horas"
      description={lead.company_name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="time-form" loading={add.isPending}>
            Registar
          </Button>
        </>
      }
    >
      <form id="time-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
        <Field label="Dia" error={errors.date?.[0]}>
          <DateInput value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </Field>
        <Field label="Horas" error={errors.minutes?.[0]}>
          <Input type="number" inputMode="numeric" min={0} max={24} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
        </Field>
        <Field label="Minutos">
          <Input type="number" inputMode="numeric" min={0} max={59} step={5} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
        </Field>
        <Field label="O que fizeste (opcional)" className="sm:col-span-3">
          <Input maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex.: maquete da página inicial" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function TimeSection({ lead }: { lead: Lead }) {
  const { data: time, isLoading } = useProjectTime(lead.id);
  const remove = useDeleteTime(lead.id);
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const running = time?.running ?? null;
  const elapsed = useElapsed(running?.started_at ?? null);
  // O registo a contar entra no total com os segundos que já passaram.
  const total = (time?.total_minutes ?? 0) - (running?.minutes ?? 0) + Math.floor(elapsed / 60);
  const entries = (time?.entries ?? []).filter((e) => e.ended_at);
  const shown = all ? entries : entries.slice(0, 4);

  return (
    <section aria-labelledby={`time-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`time-${lead.id}`}
        icon={Clock}
        title="Horas"
        summary={
          time ? (
            <>
              {formatMinutes(total)}
              {time.hourly_rate ? <> · <strong className="font-semibold text-fg">{formatCurrency(time.hourly_rate, { decimals: false })}/hora</strong></> : null}
            </>
          ) : null
        }
        action={
          <>
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> À mão
            </Button>
            <TimerButton leadId={lead.id} runningSince={running?.started_at ?? null} />
          </>
        }
      />
      {time && !time.value && total >= 15 ? (
        <p className="mt-1 text-xs text-muted">Para ver quanto ganhas por hora, indica o valor (proposta aceite, pagamentos ou valor estimado).</p>
      ) : null}
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : shown.length ? (
        <ul className="mt-2 flex flex-col gap-1" aria-label="Horas registadas">
          {shown.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 text-xs text-muted tabular">{formatDate(e.started_at).slice(0, 5)}</span>
              <span className="w-20 shrink-0 font-medium tabular">{formatMinutes(e.minutes)}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{e.notes ?? ''}</span>
              <Button
                size="icon"
                variant="ghost"
                className="-my-1 h-7 w-7"
                onClick={() => remove.mutate(e.id, { onError: (err) => toast.error(errorMessage(err)) })}
                aria-label={`Apagar o registo de ${formatMinutes(e.minutes)} (${formatDate(e.started_at)})`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : !running ? (
        <p className="mt-2 text-sm text-muted">Carrega em Começar quando estiveres a trabalhar neste projeto.</p>
      ) : null}
      {entries.length > 4 ? (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll(!all)}>
          {all ? 'Mostrar menos' : `Ver todos (${entries.length})`}
        </Button>
      ) : null}
      {adding ? <TimeDialog lead={lead} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
