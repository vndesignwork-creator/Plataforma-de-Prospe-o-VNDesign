'use client';

/**
 * Estatísticas → Rentabilidade (com os Projetos e o registo de horas ligados):
 * quanto ganhas por hora em cada serviço e cliente, horas e valor recebido por
 * mês e quanto tempo demora um projeto.
 */
import { formatCurrency, formatMinutes, leadPath, serviceLabel } from '@vndesign/core';
import Link from 'next/link';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { StatTile } from '@/components/charts/stat-tile';
import { HourlyRateButton, TimeMoney } from '@/components/projects/hourly-rate';
import { ServiceIcon, useServiceCatalog } from '@/components/services/services';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { useProfitability, useSettings } from '@/lib/queries';

const euros = (v: number) => formatCurrency(v, { decimals: false });
const monthFmt = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });
const monthLongFmt = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthItem = (month: string, value: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  return { key: month, label: monthFmt.format(d).replace('.', ''), fullLabel: monthLongFmt.format(d), value };
};

/** `bare`: sem o título (a página Estatísticas põe-no na barra da secção). */
export function ProfitabilitySection({ bare }: { bare?: boolean } = {}) {
  const { data: settings } = useSettings();
  const enabled = !!settings?.features.projects;
  const timeOn = !!settings?.features.time_tracking;
  const { data, isLoading } = useProfitability(enabled);
  const catalog = useServiceCatalog();
  if (!enabled) return null;
  if (isLoading || !data) return <Skeleton className="h-48" />;
  const t = data.totals;
  const hours = (m: number) => formatMinutes(m);

  return (
    <section aria-labelledby={bare ? undefined : 'rentabilidade'} aria-label={bare ? 'Rentabilidade' : undefined} className="flex flex-col gap-5">
      {bare ? null : (
        <div>
          <h2 id="rentabilidade" className="font-display text-xl font-semibold">
            Rentabilidade
          </h2>
          <p className="text-sm text-muted">
            Valor de cada projeto (proposta aceite, pagamentos ou valor estimado) a dividir pelas horas registadas.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Ganho médio por hora"
          value={t.rate ? `${euros(t.rate)}/h` : '—'}
          hint={!timeOn ? 'Liga o registo de horas' : t.expenses && t.net_rate !== null ? `${euros(t.net_rate)}/h depois das despesas` : 'Projetos com horas e valor'}
        />
        <StatTile
          label="Horas registadas"
          value={hours(t.minutes)}
          hint={
            <>
              {t.projects} projeto{t.projects === 1 ? '' : 's'}
              <TimeMoney seconds={t.minutes * 60} prefix=" · valem " /> <HourlyRateButton />
            </>
          }
        />
        <StatTile
          label="Duração média"
          value={t.avg_days !== null ? `${Math.round(t.avg_days)} dias` : '—'}
          hint={t.completed ? `${t.completed} concluído${t.completed === 1 ? '' : 's'}` : 'Sem projetos concluídos'}
        />
        <StatTile label="Horas por projeto" value={t.avg_minutes !== null ? hours(t.avg_minutes) : '—'} hint="Média dos concluídos" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ganho por hora, por serviço" description="Projetos com vários serviços contam uma parte para cada um" />
          <div className="p-4">
            <BarList
              caption="Ganho por hora em cada serviço"
              unit="€/hora"
              emptyText="Ainda sem horas registadas em projetos com valor."
              items={data.by_service
                .filter((s) => s.rate)
                .map((s) => ({
                  key: s.service,
                  label: serviceLabel(s.service, catalog.all),
                  mark: <ServiceIcon service={s.service} className="h-3.5 w-3.5 text-muted" />,
                  value: Math.round(s.rate!),
                  display: `${euros(s.rate!)}/h`,
                  note: `${hours(s.minutes)} · ${s.projects} projeto${s.projects === 1 ? '' : 's'}`,
                }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Ganho por hora, por cliente" description="Os 15 com melhor ganho por hora" />
          <div className="p-4">
            {data.by_client.some((c) => c.rate) ? (
              <ul className="flex flex-col gap-1.5 text-sm" aria-label="Ganho por hora por cliente">
                {data.by_client
                  .filter((c) => c.rate)
                  .map((c) => (
                    <li key={c.lead.id} className="flex items-center gap-2">
                      <Link href={`${leadPath(c.lead)}#projeto`} className="min-w-0 flex-1 truncate hover:text-accent-text hover:underline">
                        {c.lead.company_name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted tabular">
                        {hours(c.minutes)}
                        {c.value ? ` · ${euros(c.value)}` : ''}
                      </span>
                      <span className="w-20 shrink-0 text-right font-semibold tabular" title={c.expenses ? `Depois das despesas: ${c.net_rate !== null ? `${euros(c.net_rate)}/h` : '—'}` : undefined}>
                        {euros(c.rate!)}/h
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Ainda sem horas registadas em projetos com valor.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Horas por mês" description="Registo de horas, últimos 12 meses" />
          <div className="p-4">
            <ColumnChart
              caption="Horas registadas por mês, últimos 12 meses"
              items={data.monthly.map((m) => monthItem(m.month, Math.round((m.minutes / 60) * 10) / 10))}
              format={(v) => `${String(v).replace('.', ',')} h`}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Recebido por mês" description="Pagamentos marcados como pagos, últimos 12 meses" />
          <div className="p-4">
            <ColumnChart
              caption="Valor recebido por mês, últimos 12 meses"
              items={data.monthly.map((m) => monthItem(m.month, Math.round(m.received)))}
              format={(v) => euros(v)}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
