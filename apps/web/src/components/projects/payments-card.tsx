'use client';

/**
 * Pagamentos do cliente (ficha do lead): plano pronto (50/50, 30/40/30, único),
 * marcar como pago com um toque, acrescentar e apagar. Totais: recebido, em
 * falta e em atraso.
 */
import { PAYMENT_PLANS, formatCurrency, formatDate, summarizePayments, todayIso, type Lead, type LeadPayment } from '@vndesign/core';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useDeletePayment, usePaymentPlan, usePayments, useProposals, useSavePayment } from '@/lib/queries';
import { cn } from '@/lib/utils';

const euros = (v: number) => formatCurrency(v);

function PaymentDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const save = useSavePayment(lead.id);
  const [form, setForm] = useState({ description: '', amount: '', due_on: '', paid: false, method: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync({
        body: {
          description: form.description,
          amount: Number(form.amount.replace(',', '.')),
          due_on: form.due_on || null,
          paid_on: form.paid ? todayIso() : null,
          method: form.method || null,
        },
      });
      toast.success('Pagamento acrescentado.');
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
      title="Novo pagamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="payment-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Descrição" required error={errors.description?.[0]} className="sm:col-span-2" hint="Ex.: Sinal, Manutenção de novembro">
          <Input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Valor (€)" required error={errors.amount?.[0]}>
          <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
        </Field>
        <Field label="Data prevista" error={errors.due_on?.[0]}>
          <DateInput value={form.due_on} onChange={(v) => setForm({ ...form, due_on: v })} />
        </Field>
        <Field label="Forma de pagamento" error={errors.method?.[0]} hint="Opcional. Ex.: Transferência, MB Way">
          <Input value={form.method} maxLength={60} onChange={(e) => setForm({ ...form, method: e.target.value })} />
        </Field>
        <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
          Já está pago (hoje)
        </label>
      </form>
    </Dialog>
  );
}

function PaymentRow({ lead, payment, today }: { lead: Lead; payment: LeadPayment; today: string }) {
  const save = useSavePayment(lead.id);
  const remove = useDeletePayment(lead.id);
  // A caixa muda logo ao tocar (a lista atualiza-se quando o servidor responde).
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const paid = optimistic ?? !!payment.paid_on;
  const overdue = !payment.paid_on && !!payment.due_on && payment.due_on < today;

  async function togglePaid(next: boolean) {
    setOptimistic(next);
    try {
      await save.mutateAsync({ id: payment.id, body: { paid_on: next ? today : null } });
      toast.success(next ? `Pagamento recebido: ${euros(payment.amount)}.` : 'Marcado como por receber.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setOptimistic(null);
    }
  }

  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0"
        checked={paid}
        disabled={save.isPending}
        onChange={(e) => void togglePaid(e.target.checked)}
        aria-label={`Pago: ${payment.description}`}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium break-words', payment.paid_on && 'text-muted')}>{payment.description}</span>
        <span className={cn('block text-xs', overdue ? 'font-medium text-danger' : 'text-muted')}>
          {payment.paid_on
            ? `Pago a ${formatDate(payment.paid_on)}${payment.method ? ` · ${payment.method}` : ''}`
            : payment.due_on
              ? `${overdue ? 'Em atraso desde' : 'Previsto a'} ${formatDate(payment.due_on)}`
              : 'Por receber'}
        </span>
      </span>
      <span className={cn('text-sm font-semibold tabular', payment.paid_on && 'text-success')}>{euros(payment.amount)}</span>
      <Button
        size="icon"
        variant="ghost"
        className="-my-1 h-8 w-8"
        onClick={() => remove.mutate(payment.id, { onError: (e) => toast.error(errorMessage(e)) })}
        aria-label={`Apagar o pagamento ${payment.description}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </li>
  );
}

/** Plano rápido a partir do valor da proposta aceite (ou do valor estimado). */
export function PlanForm({ lead, onDone }: { lead: Lead; onDone?: () => void }) {
  const plan = usePaymentPlan(lead.id);
  const { data: proposals } = useProposals(lead.id);
  const accepted = proposals?.find((p) => p.status === 'aceite') ?? proposals?.find((p) => p.status === 'enviada');
  const suggested = accepted?.total ?? lead.estimated_value ?? null;
  const [total, setTotal] = useState(suggested ? String(suggested).replace('.', ',') : '');
  const [split, setSplit] = useState('0');

  async function create() {
    const value = Number(total.replace(/\s|€/g, '').replace(',', '.'));
    if (!value || value <= 0) {
      toast.error('Indica o valor total do projeto.');
      return;
    }
    try {
      await plan.mutateAsync({ total: value, split: [...PAYMENT_PLANS[Number(split)]!.split] });
      toast.success('Plano de pagamentos criado.');
      onDone?.();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">
        Cria o plano de pagamentos do projeto{accepted ? ` (proposta ${accepted.code}: ${euros(accepted.total)})` : ''}. Depois, marca cada
        pagamento quando o receberes.
      </p>
      {/* Em linha quando cabe; numa coluna estreita (ficha) o botão passa para baixo. */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Total (€)" className="w-32 shrink-0">
          <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Plano" className="min-w-0 flex-[1_1_16rem]">
          <Select value={split} onChange={(e) => setSplit(e.target.value)}>
            {PAYMENT_PLANS.map((p, i) => (
              <option key={p.label} value={String(i)}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={create} loading={plan.isPending} className="ml-auto shrink-0 whitespace-nowrap">
          Criar plano
        </Button>
      </div>
    </div>
  );
}

export function PaymentsCard({ lead }: { lead: Lead }) {
  const { data: payments, isLoading } = usePayments(lead.id);
  const [adding, setAdding] = useState(false);
  const today = todayIso();
  // Só faz sentido a partir da proposta (ou se já houver pagamentos).
  const relevant = ['proposta_enviada', 'cliente'].includes(lead.status) || !!payments?.length;
  if (lead.anonymized_at || (!isLoading && !relevant)) return null;
  const sum = summarizePayments(payments ?? [], today);

  return (
    <Card id="pagamentos" className="scroll-mt-20">
      <CardHeader
        title="Pagamentos"
        description={
          payments?.length
            ? `Recebido ${euros(sum.paid)} de ${euros(sum.total)}${sum.overdue ? ` · ${euros(sum.overdue)} em atraso` : ''}`
            : 'Sinal, prestações e o que falta receber.'
        }
        actions={
          payments?.length ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Pagamento
            </Button>
          ) : null
        }
      />
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-12" />
        </div>
      ) : payments?.length ? (
        <>
          {sum.total > 0 ? (
            <div className="px-4 pt-3" aria-hidden>
              <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-success" style={{ width: `${Math.min(100, (sum.paid / sum.total) * 100)}%` }} />
              </span>
            </div>
          ) : null}
          <ul className="divide-y divide-border" aria-label="Pagamentos do cliente">
            {payments.map((p) => (
              <PaymentRow key={p.id} lead={lead} payment={p} today={today} />
            ))}
          </ul>
        </>
      ) : (
        <>
          <PlanForm lead={lead} />
          <div className="flex justify-end px-4 pb-4">
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Wallet className="h-3.5 w-3.5" aria-hidden /> Acrescentar um pagamento à mão
            </Button>
          </div>
        </>
      )}
      {adding ? <PaymentDialog lead={lead} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
