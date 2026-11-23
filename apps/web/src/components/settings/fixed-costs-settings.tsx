'use client';

/**
 * Definições → Custos fixos: o que se paga todos os meses (alojamento,
 * software, seguros…). Não é de nenhum projeto, mas sai do bolso: entra no
 * relatório para a contabilidade e no lucro do mês.
 */
import { fixedCostPeriod, fixedCostsTotal, formatCurrency, todayIso, type FixedCost } from '@vndesign/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

const euros = (v: number) => formatCurrency(v);
/** "2026-11" a partir de hoje. */
const thisMonth = () => todayIso().slice(0, 7);

type FormValues = { description: string; amount: string; starts_on: string; ends_on: string; note: string };
const empty = (): FormValues => ({ description: '', amount: '', starts_on: thisMonth(), ends_on: '', note: '' });

function toForm(cost: FixedCost): FormValues {
  return {
    description: cost.description,
    amount: String(cost.amount).replace('.', ','),
    starts_on: cost.starts_on,
    ends_on: cost.ends_on ?? '',
    note: cost.note ?? '',
  };
}

export function FixedCostsSettings() {
  const qc = useQueryClient();
  const { data: costs, isLoading, error } = useQuery({
    queryKey: ['fixed-costs'],
    queryFn: () => api<{ data: FixedCost[] }>('/fixed-costs').then((r) => r.data),
  });
  const [form, setForm] = useState<FormValues | null>(null);
  const [editing, setEditing] = useState<FixedCost | null>(null);
  const [deleting, setDeleting] = useState<FixedCost | null>(null);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        description: values.description,
        amount: Number(values.amount.replace(/\s|€/g, '').replace(',', '.')),
        starts_on: values.starts_on,
        ends_on: values.ends_on || null,
        note: values.note || null,
      };
      return editing
        ? api<{ data: FixedCost }>(`/fixed-costs/${editing.id}`, { method: 'PUT', body })
        : api<{ data: FixedCost }>('/fixed-costs', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(editing ? 'Custo fixo guardado.' : 'Custo fixo acrescentado.');
      setForm(null);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['fixed-costs'] });
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/fixed-costs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Custo fixo apagado.');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['fixed-costs'] });
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const month = thisMonth();
  const total = costs ? fixedCostsTotal(costs, month) : 0;

  return (
    <Card>
      <CardHeader
        title="Custos fixos"
        description="O que pagas todos os meses e não é de nenhum projeto: alojamento, domínios, software, seguros…"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(empty());
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo custo fixo
          </Button>
        }
      />
      {isLoading ? (
        <div className="p-5">
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <p className="p-5 text-sm text-danger">{errorMessage(error)}</p>
      ) : costs?.length ? (
        <>
          <p className="border-b border-border px-5 py-3 text-sm text-muted">
            Este mês: <span className="font-semibold text-fg tabular">{euros(total)}</span> em custos fixos. Entram no relatório para a contabilidade e no lucro do mês.
          </p>
          <ul className="divide-y divide-border" aria-label="Custos fixos">
            {costs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <Receipt className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.description}</span>
                  <span className="block text-xs text-muted">
                    {fixedCostPeriod(c)}
                    {c.note ? ` · ${c.note}` : ''}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular">{euros(c.amount)}/mês</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`Editar ${c.description}`}
                  onClick={() => {
                    setEditing(c);
                    setForm(toForm(c));
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Apagar ${c.description}`} onClick={() => setDeleting(c)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="p-5 text-sm text-muted">
          Ainda não há custos fixos. Sem eles, o lucro dos relatórios parece maior do que é.
        </p>
      )}

      {form ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setForm(null) : undefined)}
          title={editing ? 'Editar o custo fixo' : 'Novo custo fixo'}
          description="Paga-se todos os meses, a partir do mês de início (e até ao do fim, se acabar)."
          footer={
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button onClick={() => save.mutate(form)} loading={save.isPending}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Descrição" required>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Alojamento do site" autoFocus />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Por mês (€)" required>
                <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="12,50" />
              </Field>
              <Field label="Desde (mês)" required>
                <Input type="month" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
              </Field>
              <Field label="Até (mês)" hint="Vazio: continua">
                <Input type="month" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
              </Field>
            </div>
            <Field label="Nota" hint="Opcional">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Plano anual pago em janeiro" />
            </Field>
          </div>
        </Dialog>
      ) : null}

      {deleting ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setDeleting(null) : undefined)}
          title="Apagar o custo fixo?"
          description={`"${deleting.description}" deixa de contar nos relatórios, também nos meses passados.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => remove.mutate(deleting.id)} loading={remove.isPending}>
                Apagar
              </Button>
            </>
          }
        />
      ) : null}
    </Card>
  );
}
