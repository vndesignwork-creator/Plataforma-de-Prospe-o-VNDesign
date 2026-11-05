'use client';

/**
 * Metas do mês (substituem o objetivo do dia da Prospeção): recebido, propostas, clientes
 * novos, emails, chamadas e WhatsApp. Cada meta tem a barra, o ritmo (no ritmo / atrás,
 * pelos dias úteis já passados) e quanto falta por dia útil. O dono e os administradores
 * mudam as metas (valem todos os meses até serem mudadas).
 */
import {
  GOAL_HINTS,
  GOAL_LABELS,
  GOAL_METRICS,
  GOAL_PACE_LABELS,
  GOAL_UNITS,
  PROSPECTING_GOALS,
  formatGoalValue,
  goalPace,
  perWorkdayLeft,
  todayIso,
  type GoalMetric,
  type GoalProgress,
  type MonthlyGoals,
  type ProspectingMode,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Target } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useGoals, useMe, usePreference, useSettings, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PACE_TONE = { reached: 'text-success', ahead: 'text-success', on_track: 'text-muted', behind: 'text-warning' } as const;
const BAR_TONE = { reached: 'bg-success', ahead: 'bg-accent', on_track: 'bg-accent', behind: 'bg-warning' } as const;
/** Antigo objetivo do dia (Prospeção), para sugerir as metas do mês (× 21 dias úteis). */
const DAILY_GOAL_PREFERENCE = 'prospecting.goal';
const WORKDAYS = 21;

const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`));

/** Uma meta: "12 de 20 chamadas", a barra e o ritmo. */
export function GoalBar({ metric, data, mine, compact = false }: { metric: GoalMetric; data: GoalProgress; mine?: number | null; compact?: boolean }) {
  const goal = data.goals[metric];
  if (!goal) return null;
  const done = data.team[metric];
  const pace = goalPace(done, goal, data.elapsed);
  const perDay = perWorkdayLeft(done, goal, data.month, todayIso());
  const unit = metric === 'revenue' ? '' : ` ${goal === 1 ? GOAL_UNITS[metric][0] : GOAL_UNITS[metric][1]}`;
  return (
    <span className={cn('flex flex-col gap-1', compact ? 'min-w-36' : '')}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium">{GOAL_LABELS[metric]}</span>
        <span className="tabular">
          <strong>{formatGoalValue(metric, done)}</strong>
          <span className="text-muted">
            {' '}
            de {formatGoalValue(metric, goal)}
            {unit}
          </span>
        </span>
      </span>
      <span
        role="progressbar"
        aria-label={`${GOAL_LABELS[metric]}: ${formatGoalValue(metric, done)} de ${formatGoalValue(metric, goal)}`}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(done, goal)}
        className="relative h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <span className={cn('block h-full rounded-full transition-[width]', BAR_TONE[pace])} style={{ width: `${Math.min(100, (done / goal) * 100)}%` }} />
        {/* Onde devia estar hoje (pelos dias úteis já passados). */}
        {data.elapsed > 0 && data.elapsed < 1 && pace !== 'reached' ? (
          <span className="absolute top-0 h-full w-0.5 bg-fg/40" style={{ left: `${data.elapsed * 100}%` }} aria-hidden />
        ) : null}
      </span>
      {compact ? null : (
        <span className="flex flex-wrap gap-x-2 text-xs">
          <span className={PACE_TONE[pace]}>
            {pace === 'reached' ? '✓ ' : ''}
            {GOAL_PACE_LABELS[pace]}
          </span>
          {perDay ? (
            <span className="text-muted">
              · faltam {metric === 'revenue' ? formatGoalValue(metric, perDay) : perDay} por dia útil
            </span>
          ) : null}
          {mine !== null && mine !== undefined ? <span className="text-muted">· tu: {formatGoalValue(metric, mine)}</span> : null}
        </span>
      )}
    </span>
  );
}

export function GoalsDialog({ goals, onClose }: { goals: MonthlyGoals; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: daily } = usePreference<Partial<Record<ProspectingMode, number | null>>>(DAILY_GOAL_PREFERENCE);
  const [values, setValues] = useState<Record<GoalMetric, string>>(
    () => Object.fromEntries(GOAL_METRICS.map((m) => [m, goals[m] ? String(goals[m]) : ''])) as Record<GoalMetric, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<GoalMetric, string>>>({});
  const [saving, setSaving] = useState(false);
  // Sugestões a partir do antigo objetivo do dia (× 21 dias úteis).
  const suggestion: Partial<Record<GoalMetric, number>> = {
    ...(daily?.email ? { emails: daily.email * WORKDAYS } : {}),
    ...(daily?.phone ? { calls: daily.phone * WORKDAYS } : {}),
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: MonthlyGoals = {};
    const errs: Partial<Record<GoalMetric, string>> = {};
    for (const m of GOAL_METRICS) {
      const raw = values[m].replace(/\s|€/g, '').replace(',', '.');
      if (!raw) {
        next[m] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) errs[m] = 'Um número inteiro maior que 0 (vazio = sem meta).';
      else next[m] = n;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api('/settings', { method: 'PATCH', body: { goals: next } });
      toast.success('Metas do mês guardadas.');
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['goals'] });
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Metas do mês"
      description="Valem todos os meses até as mudares. Vazio = sem meta. As de emails, chamadas e WhatsApp contam o que a equipa toda faz."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="monthly-goals" loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="monthly-goals" onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
        {GOAL_METRICS.map((m) => (
          <div key={m} className="flex flex-col gap-1">
            <label htmlFor={`goal-${m}`} className="text-sm font-medium">
              {GOAL_LABELS[m]}
              {m === 'revenue' ? ' (€)' : ''}
            </label>
            <Input
              id={`goal-${m}`}
              inputMode="numeric"
              value={values[m]}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              placeholder={suggestion[m] ? String(suggestion[m]) : m === 'revenue' ? '3000' : '—'}
              aria-invalid={errors[m] ? true : undefined}
              aria-describedby={`goal-hint-${m}`}
            />
            <span id={`goal-hint-${m}`} className={cn('text-xs', errors[m] ? 'text-danger' : 'text-muted')}>
              {errors[m] ?? (suggestion[m] && !values[m] ? `${GOAL_HINTS[m]} Sugestão: o teu objetivo do dia × ${WORKDAYS}.` : GOAL_HINTS[m])}
            </span>
          </div>
        ))}
      </form>
    </Dialog>
  );
}

/** Dashboard: as metas do mês com as barras (ou "Definir metas"). */
export function GoalsCard({ className }: { className?: string }) {
  const { data: settings } = useSettings();
  const enabled = settings?.features.monthly_goals !== false;
  const { data, isLoading } = useGoals(undefined, enabled);
  const { data: me } = useMe();
  const { data: team } = useTeamNames();
  const hasTeam = (team?.length ?? 0) > 1;
  const canEdit = me?.role === 'owner' || me?.role === 'admin';
  const [editing, setEditing] = useState(false);
  if (!enabled) return null;
  if (isLoading || !data) return <Skeleton className={cn('h-28', className)} />;
  const metrics = GOAL_METRICS.filter((m) => data.goals[m]);
  if (!metrics.length && !canEdit) return null;
  const personal = (m: GoalMetric) => (hasTeam && (m === 'emails' || m === 'calls' || m === 'whatsapp') ? data.mine[m] : null);
  return (
    <Card className={className}>
      <CardHeader
        title={`Metas de ${monthName(data.month)}`}
        description={metrics.length ? `${Math.round(data.elapsed * 100)}% do mês passado (dias úteis)` : undefined}
        actions={
          canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {metrics.length ? <Pencil className="h-3.5 w-3.5" aria-hidden /> : <Target className="h-3.5 w-3.5" aria-hidden />}
              {metrics.length ? 'Mudar metas' : 'Definir metas'}
            </Button>
          ) : null
        }
      />
      {metrics.length ? (
        <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => (
            <GoalBar key={m} metric={m} data={data} mine={personal(m)} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-muted">Define o que queres atingir este mês: recebido, propostas, clientes novos, emails, chamadas e WhatsApp. A barra de cada uma mostra se vais no ritmo.</p>
      )}
      {editing ? <GoalsDialog goals={data.goals} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

/** Topo da Prospeção: as metas do mês do modo (email: emails; telefone: chamadas e WhatsApp). */
export function ProspectingGoals({ mode }: { mode: ProspectingMode }) {
  const { data: settings } = useSettings();
  const enabled = settings?.features.monthly_goals !== false;
  const { data } = useGoals(undefined, enabled);
  const { data: me } = useMe();
  const canEdit = me?.role === 'owner' || me?.role === 'admin';
  const [editing, setEditing] = useState(false);
  if (!enabled || !data) return null;
  const metrics = PROSPECTING_GOALS[mode].filter((m) => data.goals[m]);
  if (!metrics.length) {
    return canEdit ? (
      <>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent-text max-sm:self-end"
        >
          <Target className="h-3 w-3" aria-hidden /> Definir metas do mês
        </button>
        {editing ? <GoalsDialog goals={data.goals} onClose={() => setEditing(false)} /> : null}
      </>
    ) : null;
  }
  return (
    <span className="flex flex-wrap items-end gap-x-4 gap-y-2 max-sm:self-stretch" aria-label="Metas do mês">
      {metrics.map((m) => (
        <GoalBar key={m} metric={m} data={data} compact />
      ))}
      {canEdit ? (
        <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-muted hover:text-fg" aria-label="Mudar as metas do mês" title="Mudar as metas do mês">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      {editing ? <GoalsDialog goals={data.goals} onClose={() => setEditing(false)} /> : null}
    </span>
  );
}
