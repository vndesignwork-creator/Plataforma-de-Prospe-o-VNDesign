'use client';

/**
 * Serviços de interesse de um lead (Web Design e Design Gráfico): ícones,
 * etiquetas e o seletor usado no formulário e na ficha.
 */
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  SERVICES,
  serviceLabel,
  servicesOf,
  type ServiceCategory,
  type ServiceKey,
} from '@vndesign/core';
import {
  Building2,
  FileImage,
  Images,
  LayoutTemplate,
  Monitor,
  Newspaper,
  Palette,
  PenTool,
  Shirt,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const SERVICE_ICONS: Record<ServiceKey, LucideIcon> = {
  landing_page: LayoutTemplate,
  site_institucional: Building2,
  blog: Newspaper,
  loja_online: ShoppingCart,
  identidade_visual: PenTool,
  flyers_cartazes: FileImage,
  posts_redes: Images,
  estampas: Shirt,
};

export const CATEGORY_ICONS: Record<ServiceCategory, LucideIcon> = {
  web: Monitor,
  grafico: Palette,
};

export function ServiceIcon({ service, className }: { service: ServiceKey; className?: string }) {
  const Icon = SERVICE_ICONS[service];
  return <Icon className={cn('inline-block h-4 w-4 shrink-0', className)} aria-hidden />;
}

/** Etiquetas com os serviços (ficha, lista, cartões). */
export function ServiceChips({ services, className }: { services?: readonly string[] | null; className?: string }) {
  const list = (services ?? []).filter((s): s is ServiceKey => s in SERVICES);
  if (!list.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Serviços de interesse">
      {list.map((s) => (
        <li
          key={s}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            SERVICES[s].category === 'web' ? 'bg-surface-3 text-fg' : 'bg-accent-soft text-accent-text',
          )}
        >
          <ServiceIcon service={s} className="h-3.5 w-3.5" />
          {serviceLabel(s)}
        </li>
      ))}
    </ul>
  );
}

/** Seletor por categoria: caixas grandes, fáceis de tocar no telemóvel. */
export function ServicePicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly string[];
  onChange: (value: ServiceKey[]) => void;
  disabled?: boolean;
}) {
  function toggle(key: ServiceKey, on: boolean) {
    const next = new Set(value);
    if (on) next.add(key);
    else next.delete(key);
    onChange(SERVICE_CATEGORIES.flatMap((c) => servicesOf(c)).filter((k) => next.has(k)));
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SERVICE_CATEGORIES.map((category) => {
        const CategoryIcon = CATEGORY_ICONS[category];
        return (
          <fieldset key={category} className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <CategoryIcon className="h-4 w-4 text-muted" aria-hidden />
              {SERVICE_CATEGORY_LABELS[category]}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {servicesOf(category).map((key) => {
                const checked = value.includes(key);
                return (
                  <label
                    key={key}
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
                      onChange={(e) => toggle(key, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <ServiceIcon service={key} className="text-muted" />
                    {serviceLabel(key)}
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

/** Versão compacta (tabela e Kanban): só ícones, com o nome ao passar o rato e para leitores de ecrã. */
export function ServiceIcons({ services, className }: { services?: readonly string[] | null; className?: string }) {
  const list = (services ?? []).filter((s): s is ServiceKey => s in SERVICES);
  if (!list.length) return null;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {list.map((s) => (
        <span
          key={s}
          title={serviceLabel(s)}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md',
            SERVICES[s].category === 'web' ? 'bg-surface-3 text-fg' : 'bg-accent-soft text-accent-text',
          )}
        >
          <ServiceIcon service={s} className="h-3.5 w-3.5" />
          <span className="sr-only">{serviceLabel(s)}</span>
        </span>
      ))}
    </span>
  );
}

/** Opções para os filtros de lista/Kanban (agrupadas por categoria no rótulo). */
export function serviceFilterOptions() {
  return [
    ...SERVICE_CATEGORIES.flatMap((c) =>
      servicesOf(c).map((k) => ({
        value: k,
        label: `${serviceLabel(k)} · ${SERVICE_CATEGORY_LABELS[c]}`,
        icon: <ServiceIcon service={k} className="text-muted" />,
      })),
    ),
    { value: 'none', label: 'Sem serviço definido' },
  ];
}
