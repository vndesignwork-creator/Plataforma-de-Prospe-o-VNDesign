'use client';

/** Estatísticas → Contabilidade: o mês escolhido em números e os botões para descarregar o PDF ou o Excel. */
import { formatCurrency, monthLabel, recentMonths, todayIso, type AccountingReport } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

export function AccountingSection() {
  const months = recentMonths(todayIso(), 18);
  // Por omissão, o mês passado (o que se entrega ao contabilista); nos primeiros dias, faz mais sentido.
  const [month, setMonth] = useState(months[1]!);
  const { data, isLoading, error } = useQuery({
    queryKey: ['accounting', month],
    queryFn: () => api<{ data: AccountingReport }>(`/reports/accounting?month=${month}`).then((r) => r.data),
  });
  const base = `/api/v1/reports/accounting?month=${month}`;
  const items = data
    ? [
        { label: 'Recebido', value: data.received.total, hint: `${data.received.rows.length} pagamento${data.received.rows.length === 1 ? '' : 's'}` },
        { label: 'Despesas', value: data.expenses.total, hint: `${data.expenses.rows.length} despesa${data.expenses.rows.length === 1 ? '' : 's'}` },
        { label: 'Resultado', value: data.result, hint: 'Recebido − despesas' },
        { label: 'Por receber', value: data.outstanding.total, hint: data.outstanding.overdue ? `${formatCurrency(data.outstanding.overdue)} em atraso` : 'Até ao fim do mês ou sem data' },
      ]
    : [];
  return (
    <Card>
      <CardHeader
        title="Relatório para a contabilidade"
        description="O que recebeste, gastaste e tens por receber no mês, pronto a enviar ao contabilista."
        actions={
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês do relatório" className="h-9 w-auto">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : error ? (
          <p className="text-sm text-danger">{errorMessage(error)}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map((i) => (
              <div key={i.label} className="rounded-lg bg-surface-2 p-3">
                <dt className="text-xs text-muted">{i.label}</dt>
                <dd className="text-xl font-semibold tabular">{formatCurrency(i.value)}</dd>
                <dd className="text-xs text-muted">{i.hint}</dd>
              </div>
            ))}
          </dl>
        )}
        {/* Os dois com a mesma largura: lado a lado (a toda a largura no telemóvel, à direita no computador). */}
        <div className="ml-auto grid w-full grid-cols-2 gap-2 sm:w-fit">
          <a href={`${base}&format=pdf`} className={buttonClasses('outline', 'sm', 'w-full')} download>
            <FileText className="h-4 w-4" aria-hidden /> Descarregar PDF
          </a>
          <a href={`${base}&format=xlsx`} className={buttonClasses('outline', 'sm', 'w-full')} download>
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> Descarregar Excel
          </a>
        </div>
        <p className="text-xs text-muted">Recebido: pagamentos com data de pagamento no mês. Despesas: as dos projetos. Por receber: o que falta pagar (situação de hoje).</p>
      </div>
    </Card>
  );
}
