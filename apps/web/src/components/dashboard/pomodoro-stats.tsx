'use client';

/** Estatísticas → Pomodoro: quantos fizeste por dia (14 dias) e em que projetos. */
import { formatMinutes, projectLabel } from '@vndesign/core';
import { BarList } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { StatTile } from '@/components/charts/stat-tile';
import { usePomodoroSettings } from '@/components/projects/pomodoro';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { usePomodoroStats } from '@/lib/queries';

const dayFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const dayLongFmt = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function PomodoroStatsSection() {
  const enabled = !!usePomodoroSettings();
  const { data, isLoading } = usePomodoroStats(enabled);
  if (!enabled) return null;
  if (isLoading || !data) return <Skeleton className="h-40" />;
  const avg = Math.round((data.week / 7) * 10) / 10;

  return (
    <section aria-labelledby="pomodoros" className="flex flex-col gap-5">
      <div>
        <h2 id="pomodoros" className="font-display text-xl font-semibold">
          Pomodoro
        </h2>
        <p className="text-sm text-muted">Os teus blocos de trabalho completos (o trabalho conta nas horas de cada projeto).</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Hoje" value={`${data.today} 🍅`} />
        <StatTile label="Últimos 7 dias" value={data.week} hint={`${String(avg).replace('.', ',')} por dia`} />
        <StatTile label="Tempo em pomodoros" value={formatMinutes(data.minutes_week)} hint="Últimos 7 dias" />
        <StatTile label="Projetos" value={data.by_project.length} hint="Últimos 14 dias" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pomodoros por dia" description="Últimos 14 dias" />
          <div className="p-4">
            <ColumnChart
              caption="Pomodoros completos por dia, últimos 14 dias"
              unit="pomodoros"
              items={data.days.map((d) => {
                const date = new Date(`${d.date}T00:00:00Z`);
                return { key: d.date, label: dayFmt.format(date), fullLabel: dayLongFmt.format(date), value: d.count };
              })}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Por projeto" description="Últimos 14 dias" />
          <div className="p-4">
            <BarList
              caption="Pomodoros por projeto"
              unit="pomodoros"
              emptyText="Ainda sem pomodoros: começa um no cartão de um projeto."
              items={data.by_project.map((p) => ({
                key: p.lead.id,
                label: projectLabel(p.lead),
                value: p.count,
                display: `${p.count} 🍅`,
                note: formatMinutes(p.minutes),
              }))}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
