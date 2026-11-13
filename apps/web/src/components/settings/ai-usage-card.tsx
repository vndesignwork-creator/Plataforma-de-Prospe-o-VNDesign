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

type CreditRow = AiUsageSummary['credits'][number];

/** O saldo de um fornecedor (cada chave é uma conta separada: não se somam). */
function CreditTile({ c }: { c: CreditRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [alertBelow, setAlertBelow] = useState('');
  const [saving, setSaving] = useState(false);
  const low = c.remaining_usd !== null && c.alert_below_usd !== null && c.remaining_usd < c.alert_below_usd;

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
      await api('/ai/credit', { method: 'PUT', body: { provider: c.kind, amount_usd: value, alert_below_usd: below, reset: true } });
      await qc.invalidateQueries({ queryKey: ['ai-usage'] });
      toast.success(value === null ? `${c.label}: saldo retirado.` : `${c.label}: ${usd(value)} a contar de agora.`);
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={cn('flex flex-col gap-1.5 rounded-lg p-3', low ? 'bg-danger-soft' : 'bg-surface-2')} data-credit={c.kind} aria-label={`Créditos de ${c.label}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-medium">{c.label}</span>
        {c.console_url ? (
          <a href={c.console_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline">
            Saldo exato na consola <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      <span className={cn('text-xl font-semibold tabular', low && 'text-danger')} data-testid={`ai-remaining-${c.kind}`}>
        {c.remaining_usd === null ? '—' : `≈ ${usd(Math.max(0, c.remaining_usd))}`}
      </span>
      <span className="text-xs text-muted">
        {c.amount_usd === null
          ? 'Indica quanto carregaste neste fornecedor'
          : `de ${usd(c.amount_usd)} desde ${formatDate(c.since!.slice(0, 10))} · gastos ${usd(c.spent_since_usd)}`}
      </span>
      {editing ? (
        <form onSubmit={save} className="mt-1 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Saldo agora (USD)</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex.: 20" className="w-28" aria-label={`Saldo de ${c.label} em dólares`} autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Avisar abaixo de</span>
            <Input inputMode="decimal" value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)} placeholder="ex.: 3" className="w-24" aria-label={`Avisar quando ${c.label} tiver menos de`} />
          </label>
          <Button type="submit" size="sm" loading={saving}>
            Guardar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="mt-1 self-start"
          onClick={() => {
            setAmount(c.amount_usd != null ? String(Math.max(0, c.remaining_usd ?? c.amount_usd)).replace('.', ',') : '');
            setAlertBelow(c.alert_below_usd != null ? String(c.alert_below_usd).replace('.', ',') : '');
            setEditing(true);
          }}
          aria-label={c.amount_usd == null ? `Indicar o saldo de ${c.label}` : `Atualizar o saldo de ${c.label}`}
        >
          {c.amount_usd == null ? 'Indicar o saldo' : 'Atualizar o saldo'}
        </Button>
      )}
    </li>
  );
}

export function AiUsageCard() {
  const months = recentMonths(todayIso(), 12);
  const [month, setMonth] = useState(months[0]!);
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-usage', month],
    queryFn: () => api<{ data: AiUsageSummary }>('/ai/usage', { query: { month } }).then((r) => r.data),
  });
  return (
    <Card>
      <CardHeader
        title="Consumo e créditos"
        description="Quanto a IA gastou (estimativa pelo preço de tabela) e quanto resta em cada fornecedor."
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
            <div className="rounded-lg bg-surface-2 p-3">
              <span className="block text-xs text-muted">Gasto em {monthLabel(month)} (todos os fornecedores)</span>
              <span className="block text-xl font-semibold tabular" data-testid="ai-spent-month">
                {usd(data.total_usd)}
              </span>
              <span className="block text-xs text-muted">
                {data.calls} {data.calls === 1 ? 'pedido' : 'pedidos'} · mês anterior {usd(data.previous_month_usd)}
                {data.credits.length > 1 ? ` · ${data.credits.map((c) => `${c.label.split(' (')[0]} ${usd(c.spent_month_usd)}`).join(' · ')}` : ''}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium">Créditos que restam</h3>
              <p className="text-xs text-muted">
                Cada fornecedor é uma conta separada, com o seu saldo: não se somam. Escreve o saldo que vês na consola de cada um; a plataforma desconta o que a IA gastar
                a partir daí. Sempre que carregares mais, atualiza o saldo.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="Créditos por fornecedor">
                {data.credits.map((c) => (
                  <CreditTile key={c.kind} c={c} />
                ))}
              </ul>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Breakdown title="Em quê" rows={data.by_feature} />
              <Breakdown title="Por pessoa" rows={data.by_user} />
              <Breakdown title="Por modelo" rows={data.by_model} />
            </div>
            {data.calls === 0 ? <p className="text-sm text-muted">Nenhum pedido à IA neste mês.</p> : null}
            <p className="text-xs text-muted">
              Estimativa pelo preço de tabela (os valores reais podem variar um pouco).{' '}
              {data.unpriced_calls ? `${data.unpriced_calls} pedidos de modelos sem preço conhecido não entram no total.` : ''}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
