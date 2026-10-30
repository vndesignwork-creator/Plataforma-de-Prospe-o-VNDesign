'use client';

/**
 * Serviços de interesse de um lead: ícones, etiquetas, o seletor do formulário e
 * os filtros. A lista vem de Definições → Serviços (GET /services); enquanto
 * carrega, usa os serviços de origem.
 */
import {
  DEFAULT_SERVICES,
  DEFAULT_SERVICE_CATEGORIES,
  categoryLabel,
  serviceLabel,
  serviceShortLabel,
  type ServiceCategoryInfo,
  type ServiceIconKey,
  type ServiceInfo,
} from '@vndesign/core';
import {
  BookOpen,
  Briefcase,
  Building2,
  Camera,
  FileImage,
  Heart,
  Images,
  LayoutGrid,
  LayoutTemplate,
  Mail,
  Megaphone,
  Music,
  Monitor,
  Newspaper,
  Package,
  Palette,
  PenTool,
  Presentation,
  Printer,
  Search,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useServiceCategories, useServices } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const SERVICE_ICON_COMPONENTS: Record<ServiceIconKey, LucideIcon> = {
  layout: LayoutTemplate,
  building: Building2,
  newspaper: Newspaper,
  cart: ShoppingCart,
  pen: PenTool,
  'file-image': FileImage,
  images: Images,
  shirt: Shirt,
  monitor: Monitor,
  smartphone: Smartphone,
  palette: Palette,
  camera: Camera,
  video: Video,
  megaphone: Megaphone,
  search: Search,
  mail: Mail,
  printer: Printer,
  package: Package,
  book: BookOpen,
  presentation: Presentation,
  wrench: Wrench,
  briefcase: Briefcase,
  grid: LayoutGrid,
  heart: Heart,
  music: Music,
  sparkles: Sparkles,
};

/** Cores das etiquetas: Web Design neutro, Design Gráfico laranja, as outras com contorno. */
export function categoryChipClass(category: string): string {
  return category === 'web'
    ? 'bg-surface-3 text-fg'
    : category === 'grafico'
      ? 'bg-accent-soft text-accent-text'
      : 'border border-border-strong text-fg';
}

export interface ServiceCatalog {
  /** Todos (também os escondidos), pela ordem definida. */
  all: ServiceInfo[];
  /** Só os visíveis (para escolher). */
  active: ServiceInfo[];
  get: (key: string) => ServiceInfo | undefined;
  /** Categorias pela ordem definida. */
  categories: ServiceCategoryInfo[];
  categoryLabel: (key: string) => string;
  categoryIcon: (key: string) => string | null | undefined;
}

/** Serviços e categorias do workspace (com os escondidos, para mostrar os leads antigos). */
export function useServiceCatalog(): ServiceCatalog {
  const { data } = useServices(true);
  const { data: cats } = useServiceCategories();
  return useMemo(() => {
    const all: ServiceInfo[] = data ?? DEFAULT_SERVICES;
    const categories: ServiceCategoryInfo[] = cats ?? DEFAULT_SERVICE_CATEGORIES;
    const byKey = new Map(all.map((s) => [s.key, s]));
    return {
      all,
      active: all.filter((s) => !s.archived_at),
      get: (key: string) => byKey.get(key),
      categories,
      categoryLabel: (key: string) => categoryLabel(key, categories),
      categoryIcon: (key: string) => categories.find((c) => c.key === key)?.icon,
    };
  }, [data, cats]);
}

const iconKey = (icon: string | null | undefined): ServiceIconKey =>
  icon && icon in SERVICE_ICON_COMPONENTS ? (icon as ServiceIconKey) : 'sparkles';

/** Ícone escolhido para um serviço (ou "Outro" se não tiver). */
export function ServiceGlyph({ icon, className }: { icon: string | null | undefined; className?: string }) {
  const Icon = SERVICE_ICON_COMPONENTS[iconKey(icon)];
  return <Icon className={cn('inline-block h-4 w-4 shrink-0', className)} aria-hidden />;
}

export function ServiceIcon({ service, className }: { service: string; className?: string }) {
  const catalog = useServiceCatalog();
  return <ServiceGlyph icon={catalog.get(service)?.icon} className={className} />;
}

/** Etiquetas com os serviços (ficha). */
export function ServiceChips({ services, className }: { services?: readonly string[] | null; className?: string }) {
  const catalog = useServiceCatalog();
  const list = (services ?? []).filter((s) => catalog.get(s));
  if (!list.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Serviços de interesse">
      {list.map((s) => (
        <li
          key={s}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            categoryChipClass(catalog.get(s)!.category),
          )}
        >
          <ServiceIcon service={s} className="h-3.5 w-3.5" />
          {serviceLabel(s, catalog.all)}
        </li>
      ))}
    </ul>
  );
}

/** Seletor por categoria: caixas grandes, fáceis de tocar no telemóvel. */
/** `compact`: etiquetas clicáveis numa linha por categoria (formulário do lead); as categorias grandes mostram 8 e "+N". */
export function ServicePicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: readonly string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const catalog = useServiceCatalog();
  // Os visíveis, mais os escondidos que este lead já tem (para não se perderem sem aviso).
  const shown = catalog.all.filter((s) => !s.archived_at || value.includes(s.key));
  const order = catalog.all.map((s) => s.key);

  function toggle(key: string, on: boolean) {
    const next = new Set(value);
    if (on) next.add(key);
    else next.delete(key);
    onChange(order.filter((k) => next.has(k)));
  }

  const groups = catalog.categories
    .map((c) => ({ category: c.key, items: shown.filter((s) => s.category === c.key) }))
    .filter((g) => g.items.length);
  if (compact) {
    const LIMIT = 8;
    return (
      <div className="flex flex-col gap-3">
        {groups.map(({ category, items }) => {
          // Os escolhidos ficam sempre à vista, mesmo para lá dos 8.
          const open = expanded.includes(category) || items.length <= LIMIT;
          const visible = open ? items : items.filter((s, i) => i < LIMIT || value.includes(s.key));
          const hidden = items.length - visible.length;
          return (
            <fieldset key={category} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
              <legend className="float-left flex shrink-0 items-center gap-1.5 pt-1 text-sm font-semibold sm:w-36">
                <ServiceGlyph icon={catalog.categoryIcon(category)} className="text-muted" />
                {catalog.categoryLabel(category)}
              </legend>
              <div className="clear-left flex min-w-0 flex-1 flex-wrap gap-1.5">
                {visible.map((s) => {
                  const checked = value.includes(s.key);
                  return (
                    <label
                      key={s.key}
                      className={cn(
                        'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors pointer-coarse:min-h-10',
                        checked ? 'border-accent bg-accent-soft text-accent-text' : 'border-border-input text-muted hover:border-muted hover:text-fg',
                        disabled && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => toggle(s.key, e.target.checked)}
                        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                      />
                      <ServiceGlyph icon={s.icon} className={checked ? 'text-accent-text' : 'text-muted'} />
                      {s.label}
                      {s.archived_at ? <span className="text-muted"> (escondido)</span> : null}
                    </label>
                  );
                })}
                {hidden > 0 || (expanded.includes(category) && items.length > LIMIT) ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((list) => (list.includes(category) ? list.filter((c) => c !== category) : [...list, category]))}
                    aria-expanded={hidden === 0}
                    aria-label={hidden > 0 ? `+${hidden}: mostrar todos os serviços de ${catalog.categoryLabel(category)}` : undefined}
                    className="inline-flex min-h-8 items-center rounded-full px-2.5 text-sm text-accent-text hover:underline"
                  >
                    {hidden > 0 ? `+${hidden}` : 'Mostrar menos'}
                  </button>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map(({ category, items }) => {
        return (
          <fieldset key={category} className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <ServiceGlyph icon={catalog.categoryIcon(category)} className="text-muted" />
              {catalog.categoryLabel(category)}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((s) => {
                const checked = value.includes(s.key);
                return (
                  <label
                    key={s.key}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      checked ? 'border-accent bg-accent-soft' : 'border-border-input hover:border-muted',
                      disabled && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => toggle(s.key, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <ServiceGlyph icon={s.icon} className="text-muted" />
                    <span className="min-w-0 break-words">
                      {s.label}
                      {s.archived_at ? <span className="text-muted"> (escondido)</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/**
 * Serviços de um lead em ícones (tabela e Kanban). Com `labeled`, cada ícone leva
 * um nome curto (no telemóvel não há "title" ao passar o rato).
 */
export function ServiceIcons({
  services,
  className,
  labeled,
}: {
  services?: readonly string[] | null;
  className?: string;
  labeled?: boolean;
}) {
  const catalog = useServiceCatalog();
  const list = (services ?? []).filter((s) => catalog.get(s));
  if (!list.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {list.map((s) => {
        const info = catalog.get(s)!;
        return (
          <span
            key={s}
            title={info.label}
            className={cn(
              'inline-flex h-6 items-center justify-center gap-1 rounded-md',
              labeled ? 'px-1.5 text-xs font-medium' : 'w-6',
              categoryChipClass(info.category),
            )}
          >
            <ServiceGlyph icon={info.icon} className="h-3.5 w-3.5" />
            {labeled ? <span aria-hidden>{serviceShortLabel(s, catalog.all)}</span> : null}
            <span className="sr-only">{info.label}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Opções para os filtros de lista/Kanban (com a categoria no rótulo). */
export function useServiceFilterOptions() {
  const catalog = useServiceCatalog();
  return [
    ...catalog.all.map((s) => ({
      value: s.key,
      label: `${s.label} · ${catalog.categoryLabel(s.category)}${s.archived_at ? ' (escondido)' : ''}`,
      icon: <ServiceGlyph icon={s.icon} className="text-muted" />,
    })),
    { value: 'none', label: 'Sem serviço definido' },
  ];
}

/** Seletor de serviço (pacotes, listas de tarefas): agrupado por categoria. */
export function ServiceOptions({ catalog, category }: { catalog: ServiceCatalog; category?: string }) {
  const groups = catalog.categories
    .filter((c) => !category || c.key === category)
    .map((c) => ({ c: c.key, items: catalog.all.filter((s) => s.category === c.key && !s.archived_at) }))
    .filter((g) => g.items.length);
  return (
    <>
      {groups.map(({ c, items }) =>
        category ? (
          items.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))
        ) : (
          <optgroup key={c} label={catalog.categoryLabel(c)}>
            {items.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </>
  );
}
