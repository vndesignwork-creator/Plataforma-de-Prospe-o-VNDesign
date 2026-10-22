'use client';

/**
 * Despesas do projeto (alojamento, plugins, fotos, impressão…): o lucro real
 * (valor − despesas) e quanto ganhas por hora depois das despesas.
 */
import { formatCurrency, formatDate, todayIso, type Lead } from '@vndesign/core';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useExpenseAction, useExpenses, useProjectTime, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

const euros = (v: number) => formatCurrency(v);

export function ExpensesSection({ lead }: { lead: Lead }) {
  const { data: settings } = useSettings();
  const { data: expenses, isLoading } = useExpenses(lead.id);
  const { data: time } = useProjectTime(lead.id, !!settings?.features.time_tracking);
  const action = useExpenseAction(lead.id);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', spent_on: todayIso() });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const total = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await action.mutateAsync({
        body: { description: form.description, amount: Number(form.amount.replace(/\s|€/g, '').replace(',', '.')), spent_on: form.spent_on || undefined },
      });
      setForm({ description: '', amount: '', spent_on: todayIso() });
      toast.success('Despesa registada.');
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby={`expenses-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`expenses-${lead.id}`}
        icon={Receipt}
        title="Despesas e lucro"
        summary={total ? `${euros(total)} em despesas` : null}
        action={
          adding ? null : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Despesa
            </Button>
          )
        }
      />
      {time?.value ? (
        <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-2 text-center text-xs">
          <div>
            <dt className="text-muted">Valor</dt>
            <dd className="text-sm font-semibold tabular">{euros(time.value)}</dd>
          </div>
          <div>
            <dt className="text-muted">Lucro</dt>
            <dd className={cn('text-sm font-semibold tabular', (time.profit ?? 0) < 0 ? 'text-danger' : 'text-success')}>{euros(time.profit ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-muted">Líquido por hora</dt>
            <dd className="text-sm font-semibold tabular">{time.net_rate !== null ? `${formatCurrency(time.net_rate, { decimals: false })}/h` : '—'}</dd>
          </div>
        </dl>
      ) : null}
      {isLoading ? (
        <Skeleton className="mt-2 h-8" />
      ) : expenses?.length ? (
        <ul className="mt-2 flex flex-col gap-1" aria-label="Despesas do projeto">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 text-xs text-muted tabular">{formatDate(e.spent_on).slice(0, 5)}</span>
              <span className="min-w-0 flex-1 truncate">{e.description}</span>
              <span className="shrink-0 font-medium tabular">{euros(e.amount)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="-my-1 h-7 w-7"
                onClick={() => action.mutate({ id: e.id }, { onError: (err) => toast.error(errorMessage(err)) })}
                aria-label={`Apagar a despesa ${e.description}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="mt-2 text-sm text-muted">Regista os custos (alojamento, plugins, fotos, impressão) para veres o lucro real.</p>
      ) : null}
      {adding ? (
        <form onSubmit={add} className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]" noValidate aria-label="Nova despesa">
          <div>
            <Input aria-label="Descrição da despesa" placeholder="Ex.: Alojamento (1 ano)" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} autoFocus />
            {errors.description ? <p className="mt-1 text-xs text-danger">{errors.description[0]}</p> : null}
          </div>
          <div>
            <Input aria-label="Valor (€)" placeholder="0,00 €" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            {errors.amount ? <p className="mt-1 text-xs text-danger">{errors.amount[0]}</p> : null}
          </div>
          <DateInput aria-label="Data da despesa" value={form.spent_on} onChange={(v) => setForm({ ...form, spent_on: v })} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-10" loading={action.isPending}>
              Acrescentar
            </Button>
            <Button size="sm" variant="ghost" className="h-10" onClick={() => setAdding(false)}>
              Fechar
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
