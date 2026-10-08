export interface ColumnItem {
  key: string;
  /** Rótulo curto no eixo (ex.: "05/10"). */
  label: string;
  /** Texto completo para tooltip e tabela (ex.: "Semana de 05/10/2026"). */
  fullLabel: string;
  value: number;
}

/**
 * Colunas de uma só série (evolução semanal). Rótulos de valor só no máximo e
 * na última coluna; o resto fica no tooltip e na tabela para leitores de ecrã.
 */
export function ColumnChart({ items, caption, unit = 'leads' }: { items: ColumnItem[]; caption: string; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const maxIndex = items.reduce((best, item, i) => (item.value > (items[best]?.value ?? -1) ? i : best), 0);
  const height = 144;
  return (
    <figure>
      <div aria-hidden className="relative">
        <div className="flex items-end gap-1 border-b border-border" style={{ height }}>
          {items.map((item, i) => {
            const h = item.value > 0 ? Math.max(3, (item.value / max) * (height - 20)) : 0;
            const showLabel = item.value > 0 && (i === maxIndex || i === items.length - 1);
            return (
              <div key={item.key} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                {showLabel ? <span className="mb-1 text-xs font-medium tabular text-fg">{item.value}</span> : null}
                <span className="w-full max-w-6 rounded-t bg-accent transition-[height] duration-500" style={{ height: h }} />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap text-fg shadow-card group-hover:block"
                >
                  {item.fullLabel}: {item.value} {unit}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1">
          {items.map((item, i) => (
            <span key={item.key} className="flex-1 text-center text-[11px] text-muted tabular">
              {i % 2 === items.length % 2 || i === items.length - 1 ? item.label : ''}
            </span>
          ))}
        </div>
      </div>
      {/* Tabela equivalente para leitores de ecrã (num div: tabelas ignoram width:1px). */}
      <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col">Leads</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key}>
              <th scope="row">{i.fullLabel}</th>
              <td>{i.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
