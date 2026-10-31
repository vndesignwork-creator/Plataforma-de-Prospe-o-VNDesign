'use client';

/**
 * Topo da Prospeção: o objetivo do dia (de cada pessoa, por modo) com a barra
 * de progresso e a ajuda "Como funciona" (aberta só na primeira visita).
 */
import type { ProspectingMode } from '@vndesign/core';
import { HelpCircle, Pencil, Target } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button, HoverHint } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePreference, useSetPreference } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Objetivo do dia de cada pessoa: emails enviados (a trabalhar por email) e contactos (a telefonar). */
const GOAL_PREFERENCE = 'prospecting.goal';
type Goals = Partial<Record<ProspectingMode, number | null>>;
const UNIT: Record<ProspectingMode, [string, string]> = { email: ['email', 'emails'], phone: ['contacto', 'contactos'] };

/** "7 de 20 emails hoje" com a barra (verde ao chegar), ou "Definir objetivo do dia". */
export function DailyGoal({ mode, done }: { mode: ProspectingMode; done: number }) {
  const { data: goals } = usePreference<Goals>(GOAL_PREFERENCE);
  const [open, setOpen] = useState(false);
  const goal = goals?.[mode] ?? null;
  const reached = goal !== null && done >= goal;
  return (
    <>
      {goal ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex w-fit items-center gap-2 rounded-md text-sm hover:text-fg max-sm:self-end"
          aria-label={`Objetivo do dia: ${done} de ${goal}. Alterar`}
        >
          <span
            role="progressbar"
            aria-label="Objetivo do dia"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(done, goal)}
            className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3"
          >
            <span className={cn('block h-full rounded-full transition-[width]', reached ? 'bg-success' : 'bg-accent')} style={{ width: `${Math.min(100, (done / goal) * 100)}%` }} />
          </span>
          <span className={cn('tabular', reached && 'font-medium text-success')}>
            {reached ? '✓ ' : ''}
            {done} de {goal}
          </span>
          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
        </button>
      ) : (
        // Com ar de botão (antes parecia só texto); no telemóvel fica à direita.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-accent/50 bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent-text hover:border-accent hover:bg-accent/20 max-sm:self-end"
        >
          <Target className="h-3.5 w-3.5" aria-hidden /> Definir objetivo do dia
        </button>
      )}
      {open ? <GoalDialog mode={mode} goals={goals ?? {}} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GoalDialog({ mode, goals, onClose }: { mode: ProspectingMode; goals: Goals; onClose: () => void }) {
  const setGoals = useSetPreference<Goals>(GOAL_PREFERENCE);
  const current = goals[mode];
  const [value, setValue] = useState(current ? String(current) : '');
  const [error, setError] = useState<string | null>(null);
  const plural = UNIT[mode][1];

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = value.trim() ? Number(value.trim()) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 500)) {
      setError('Indica um número inteiro entre 1 e 500.');
      return;
    }
    setGoals.mutate(
      { ...goals, [mode]: n },
      {
        onSuccess: () => {
          toast.success(n ? `Objetivo do dia: ${n} ${n === 1 ? UNIT[mode][0] : plural}.` : 'Objetivo do dia apagado.');
          onClose();
        },
        onError: () => toast.error('Não foi possível guardar o objetivo.'),
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Objetivo do dia"
      description={
        mode === 'email'
          ? 'Quantos emails de prospeção queres enviar por dia. A barra enche à medida que envias.'
          : 'Quantos contactos (chamadas, WhatsApp…) queres registar por dia. A barra enche à medida que registas.'
      }
      className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="prospecting-goal" loading={setGoals.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="prospecting-goal" onSubmit={submit} noValidate>
        <Field label={`${plural.charAt(0).toUpperCase()}${plural.slice(1)} por dia`} hint="Vazio = sem objetivo. Só tu vês." error={error ?? undefined}>
          <Input inputMode="numeric" placeholder="20" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

const HELP_SEEN = 'vnd.prospecao.help';

/** Ajuda recolhida: o botão "Como funciona" abre-a; na primeira visita aparece aberta. */
export function useProspectingHelp(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- só no browser (localStorage)
      setOpen(!window.localStorage.getItem(HELP_SEEN));
    } catch {
      setOpen(false);
    }
  }, []);
  function set(next: boolean) {
    setOpen(next);
    if (!next) {
      try {
        window.localStorage.setItem(HELP_SEEN, '1');
      } catch {
        // sem localStorage: volta a aparecer na próxima visita
      }
    }
  }
  return [open, set];
}

export function HelpButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    // Só o ícone; "Como funciona" aparece ao passar o rato.
    <Button size="icon" variant="ghost" onClick={onToggle} aria-expanded={open} aria-controls="prospecao-ajuda" className="group relative" aria-label="Como funciona">
      <HelpCircle className="h-4 w-4" aria-hidden />
      <HoverHint>Como funciona</HoverHint>
    </Button>
  );
}

export function HelpNote({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div id="prospecao-ajuda" role="note" className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
      <p className="flex-1 text-muted">{children}</p>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Percebi
      </Button>
    </div>
  );
}
