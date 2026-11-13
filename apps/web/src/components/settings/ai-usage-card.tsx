'use client';

/**
 * Definições → Inteligência artificial → Consumo e créditos: quanto se gastou no mês (custo
 * estimado pelo preço de tabela), em quê e por quem, e quanto resta do valor carregado.
 */
import { formatDate, monthLabel, recentMonths, todayIso, type AiUsageSummary } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/** "1,23 $" (até ao cêntimo; abaixo de 1 cêntimo, "< 0,01 $"). */
export function usd(v: number): string {
  if (v > 0 && v < 0.01) return '< 0,01 $';
  return `${v.toFixed(2).replace('.', ',')} $`;
}

function Breakdown({ title, rows }: { title: string; rows: AiUsageSummary['by_feature'] }) {
  if (!rows.length) return null;
  return (
    <table className="w-full text-sm">
      <caption className="pb-1 text-left text-xs font-medium text-muted">{title}</caption>
      <tbody>
        {rows.slice(0, 8).map((r) => (
          <tr key={r.key} className="border-t border-border">
            <th scope="row" className="py-1 pr-2 text-left font-normal break-all">
              {r.label}
            </th>
            <td className="py-1 pl-2 text-right text-xs text-muted tabular whitespace-nowrap">{r.calls} {r.calls === 1 ? 'pedido' : 'pedidos'}</td>
            <td className="py-1 pl-3 text-right tabular whitespace-nowrap">{usd(r.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AiUsageCard() {
  const qc = useQueryClient();
  const months = recentMonths(todayIso(), 12);
  const [month, setMonth] = useState(months[0]!);
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-usage', month],
    queryFn: () => api<{ data: AiUsageSummary }>('/ai/usage', { query: { month } }).then((r) => r.data),
  });
  const [amount, setAmount] = useState('');
  const [alertBelow, setAlertBelow] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const credit = data?.credit;

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = amount.trim() ? Number(amount.replace(',', '.')) : null;
    const below = alertBelow.trim() ? Number(alertBelow.replace(',', '.')) : null;
    if ((value !== null && !Number.isFinite(value)) || (below !== null && !Number.isFinite(below))) {
      toast.error('Escreve só números (ex.: 20 ou 2,50).');
      return;
    }
    setSaving(true);
    try {
      await api('/ai/credit', { method: 'PUT', body: { amount_usd: value, alert_below_usd: below, reset: true } });
      await qc.invalidateQueries({ queryKey: ['ai-usage'] });
      toast.success(value === null ? 'Valor dos créditos retirado.' : `Créditos: ${usd(value)} a contar de agora.`);
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const low = credit?.remaining_usd !== null && credit?.remaining_usd !== undefined && credit.alert_below_usd !== null && credit.remaining_usd < credit.alert_below_usd;
  return (
    <Card>
      <CardHeader
        title="Consumo e créditos"
        description="Quanto a IA gastou (estimativa pelo preço de tabela) e quanto resta do que carregaste."
        actions={
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês do consumo" className="h-9 w-auto">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : error || !data ? (
          <p className="text-sm text-danger">{errorMessage(error)}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-surface-2 p-3">
                <dt className="text-xs text-muted">Gasto em {monthLabel(month)}</dt>
                <dd className="text-xl font-semibold tabular" data-testid="ai-spent-month">
                  {usd(data.total_usd)}
                </dd>
                <dd className="text-xs text-muted">
                  {data.calls} {data.calls === 1 ? 'pedido' : 'pedidos'} · mês anterior {usd(data.previous_month_usd)}
                </dd>
              </div>
              <div className={cn('rounded-lg p-3', low ? 'bg-danger-soft' : 'bg-surface-2')}>
                <dt className="text-xs text-muted">Créditos que restam</dt>
                <dd className={cn('text-xl font-semibold tabular', low && 'text-danger')} data-testid="ai-remaining">
                  {credit?.remaining_usd === null || credit?.remaining_usd === undefined ? '—' : `≈ ${usd(Math.max(0, credit.remaining_usd))}`}
                </dd>
                <dd className="text-xs text-muted">
                  {credit?.amount_usd === null || credit?.amount_usd === undefined
                    ? 'Indica quanto carregaste'
                    : `de ${usd(credit.amount_usd)} desde ${formatDate(credit.since!.slice(0, 10))} · gastos ${usd(credit.spent_since_usd)}`}
                </dd>
              </div>
              <div className="col-span-2 flex flex-col justify-center gap-1 rounded-lg bg-surface-2 p-3 text-xs sm:col-span-1">
                <span className="text-muted">O saldo exato está na consola do fornecedor:</span>
                {data.consoles.map((c) => (
                  <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                    {c.label} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ))}
              </div>
            </dl>

            {editing ? (
              <form onSubmit={save} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">Carreguei (USD)</span>
                  <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex.: 20" className="w-32" aria-label="Valor carregado em dólares" autoFocus />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium">Avisar abaixo de (USD)</span>
                  <Input inputMode="decimal" value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)} placeholder="ex.: 3" className="w-32" aria-label="Avisar quando restar menos de" />
                </label>
                <Button type="submit" size="sm" loading={saving}>
                  Guardar (conta a partir de agora)
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <p className="basis-full text-xs text-muted">Sempre que carregares mais, escreve aqui o novo saldo: o gasto passa a contar a partir desse momento.</p>
              </form>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => {
                  setAmount(credit?.amount_usd != null ? String(Math.max(0, credit.remaining_usd ?? credit.amount_usd)).replace('.', ',') : '');
                  setAlertBelow(credit?.alert_below_usd != null ? String(credit.alert_below_usd).replace('.', ',') : '');
                  setEditing(true);
                }}
              >
                {credit?.amount_usd == null ? 'Indicar quanto carreguei' : 'Atualizar o saldo'}
              </Button>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Breakdown title="Em quê" rows={data.by_feature} />
              <Breakdown title="Por pessoa" rows={data.by_user} />
              <Breakdown title="Por modelo" rows={data.by_model} />
            </div>
            {data.calls === 0 ? <p className="text-sm text-muted">Nenhum pedido à IA neste mês.</p> : null}
            <p className="text-xs text-muted">
              Estimativa pelo preço de tabela da Anthropic (os valores reais podem variar um pouco).{' '}
              {data.unpriced_calls ? `${data.unpriced_calls} pedidos de outros fornecedores (ex.: OpenAI) não têm preço aqui. ` : ''}A transcrição de áudio não entra nesta conta.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
