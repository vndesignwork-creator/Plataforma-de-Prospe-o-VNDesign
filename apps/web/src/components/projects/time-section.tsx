'use client';

/**
 * Registo de horas do projeto: temporizador ▶ Começar / ⏸ Pausar / ▶ Continuar
 * (o relógio mostra o total do projeto, não só a sessão), registos à mão,
 * corrigir ou apagar registos e o valor ganho por hora.
 */
import { formatClock, formatCurrency, formatDate, formatDuration, todayIso, type Lead, type TimeEntry } from '@vndesign/core';
import { Check, Clock, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useAddTime, useCollaborators, useDeleteTime, useProjectTime, useTimer, useUpdateTime } from '@/lib/queries';
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

/**
 * ▶ Começar → ⏸ 0:12:34 (a contar) → ▶ Continuar 0:12:34 (em pausa).
 * O relógio é o total do projeto: o já registado (`loggedSeconds`) mais a sessão.
 */
export function TimerButton({
  leadId,
  runningSince,
  loggedSeconds,
  size = 'sm',
  className,
}: {
  leadId: string;
  runningSince: string | null;
  loggedSeconds: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const timer = useTimer();
  // Até os dados novos chegarem do servidor, o botão mostra já o novo estado.
  const [optimistic, setOptimistic] = useState<{ since: string | null; logged: number } | null>(null);
  const [server, setServer] = useState({ runningSince, loggedSeconds });
  if (server.runningSince !== runningSince || server.loggedSeconds !== loggedSeconds) {
    setServer({ runningSince, loggedSeconds });
    setOptimistic(null);
  }
  const since = optimistic ? optimistic.since : runningSince;
  const logged = optimistic ? optimistic.logged : loggedSeconds;
  const elapsed = useElapsed(since);
  const running = !!since;
  const total = logged + Math.floor(elapsed);

  async function toggle() {
    const next = running ? { since: null, logged: total } : { since: new Date().toISOString(), logged };
    setOptimistic(next);
    try {
      await timer.mutateAsync({ leadId, start: !running });
      toast.success(running ? `Em pausa. Total registado: ${formatDuration(total)}.` : logged ? 'A continuar a contar.' : 'Temporizador a contar.');
    } catch (error) {
      setOptimistic(null);
      toast.error(errorMessage(error));
    }
  }

  return (
    <Button
      size={size}
      variant={running ? 'primary' : 'outline'}
      onClick={toggle}
      disabled={timer.isPending}
      className={cn('tabular', className)}
      aria-label={
        running
          ? `Pausar o temporizador (total ${formatClock(total)})`
          : logged
            ? `Continuar a contar o tempo (total ${formatClock(total)})`
            : 'Começar a contar o tempo'
      }
    >
      {running ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
      {running ? (
        formatClock(total)
      ) : logged ? (
        <>
          {/* No telemóvel só o relógio (o ▶ já diz que continua). */}
          <span className="max-sm:hidden">Continuar ·</span> {formatClock(total)}
        </>
      ) : (
        'Começar'
      )}
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
      toast.success(`${formatDuration(minutes * 60)} registados.`);
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

/** Um registo: dia, duração e notas; o lápis corrige a duração e as notas. */
function EntryRow({ lead, entry, person }: { lead: Lead; entry: TimeEntry; person?: string }) {
  const update = useUpdateTime(lead.id);
  const remove = useDeleteTime(lead.id);
  const [edit, setEdit] = useState<{ hours: string; minutes: string; notes: string } | null>(null);
  const day = formatDate(entry.started_at).slice(0, 5);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const minutes = Number(edit.hours || 0) * 60 + Number(edit.minutes || 0);
    try {
      await update.mutateAsync({ id: entry.id, body: { minutes: Math.round(minutes), notes: edit.notes } });
      setEdit(null);
      toast.success('Registo corrigido.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (edit) {
    return (
      <li>
        <form onSubmit={save} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2 text-sm" aria-label={`Corrigir o registo de ${day}`}>
          <span className="w-12 shrink-0 text-xs text-muted tabular">{day}</span>
          <Input aria-label="Horas" type="number" inputMode="numeric" min={0} max={24} className="h-8 w-16" value={edit.hours} onChange={(e) => setEdit({ ...edit, hours: e.target.value })} />
          <span className="text-xs text-muted">h</span>
          <Input aria-label="Minutos" type="number" inputMode="numeric" min={0} max={59} className="h-8 w-16" value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: e.target.value })} />
          <span className="text-xs text-muted">min</span>
          <Input aria-label="Notas" className="h-8 min-w-0 flex-[1_1_8rem]" maxLength={300} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="O que fizeste" />
          <Button type="submit" size="icon" className="h-8 w-8" loading={update.isPending} aria-label="Guardar a correção">
            <Check className="h-4 w-4" aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(null)} aria-label="Cancelar a correção">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="w-12 shrink-0 text-xs text-muted tabular">{day}</span>
      <span className="w-24 shrink-0 font-medium tabular">{formatDuration(entry.seconds)}</span>
      <span className="min-w-0 flex-1 truncate text-muted">
        {person ? <span className="mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-fg">{person}</span> : null}
        {entry.notes ?? ''}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="-my-1 h-7 w-7"
        onClick={() => setEdit({ hours: String(Math.floor(entry.minutes / 60)), minutes: String(entry.minutes % 60), notes: entry.notes ?? '' })}
        aria-label={`Corrigir o registo de ${formatDuration(entry.seconds)} (${formatDate(entry.started_at)})`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="-my-1 h-7 w-7"
        onClick={() => remove.mutate(entry.id, { onError: (err) => toast.error(errorMessage(err)) })}
        aria-label={`Apagar o registo de ${formatDuration(entry.seconds)} (${formatDate(entry.started_at)})`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </li>
  );
}

export function TimeSection({ lead, className }: { lead: Lead; className?: string }) {
  const { data: time, isLoading } = useProjectTime(lead.id);
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const running = time?.running ?? null;
  const elapsed = useElapsed(running?.started_at ?? null);
  const total = (time?.logged_seconds ?? 0) + Math.floor(elapsed);
  const entries = (time?.entries ?? []).filter((e) => e.ended_at);
  const shown = all ? entries : entries.slice(0, 5);
  // Horas registadas por colaboradores: mostra o nome de quem as fez.
  const { data: collaborators } = useCollaborators(lead.id, entries.length > 0);
  const people = new Map((collaborators ?? []).filter((c) => c.user_id).map((c) => [c.user_id!, c.name ?? c.email]));

  return (
    <section aria-labelledby={`time-${lead.id}`} className={cn('border-t border-border px-4 py-3', className)}>
      <SectionHeader
        id={`time-${lead.id}`}
        icon={Clock}
        title="Horas"
        summary={
          time ? (
            <>
              {formatDuration(total)} registadas
              {time.hourly_rate ? <> · <strong className="font-semibold text-fg">{formatCurrency(time.hourly_rate, { decimals: false })}/hora</strong></> : null}
            </>
          ) : null
        }
        action={
          <>
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> À mão
            </Button>
            {time ? <TimerButton leadId={lead.id} runningSince={running?.started_at ?? null} loggedSeconds={time.logged_seconds} /> : null}
          </>
        }
      />
      {running ? (
        <p className="mt-1 text-xs text-accent-text">A contar desde as {new Date(running.started_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })} · esta sessão: {formatClock(elapsed)}</p>
      ) : null}
      {time && !time.value && total >= 15 * 60 ? (
        <p className="mt-1 text-xs text-muted">Para ver quanto ganhas por hora, indica o valor (proposta aceite, pagamentos ou valor estimado).</p>
      ) : null}
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : shown.length ? (
        <ul className="mt-2 flex flex-col gap-1" aria-label="Horas registadas">
          {shown.map((e) => (
            <EntryRow key={e.id} lead={lead} entry={e} person={people.get(e.user_id)} />
          ))}
        </ul>
      ) : !running ? (
        <p className="mt-2 text-sm text-muted">Carrega em Começar quando estiveres a trabalhar neste projeto. Podes pausar e continuar quantas vezes quiseres.</p>
      ) : null}
      {entries.length > 5 ? (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll(!all)}>
          {all ? 'Mostrar menos' : `Ver todos (${entries.length})`}
        </Button>
      ) : null}
      {adding ? <TimeDialog lead={lead} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
