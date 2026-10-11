import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { BackLink } from './back-link';

export interface Crumb {
  label: ReactNode;
  href: string;
}

/**
 * Caminho até à página (por cima do título): "← Leads › #13 O Quintal".
 * A seta volta à página anterior no caminho; no telemóvel só aparece "← #13 O Quintal".
 * `meta` acrescenta informação depois do caminho (ex.: o setor do lead).
 */
export function Breadcrumbs({ items, meta }: { items: Crumb[]; meta?: ReactNode }) {
  const parent = items.at(-1);
  if (!parent) return null;
  return (
    <nav aria-label="Caminho" className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <BackLink
        href={parent.href}
        aria-label="Voltar"
        className="-ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surface-2 hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </BackLink>
      {/* Telemóvel: só a página anterior. */}
      <BackLink href={parent.href} className="min-w-0 truncate hover:text-fg hover:underline sm:hidden">
        {parent.label}
      </BackLink>
      <ol className="hidden min-w-0 flex-wrap items-center gap-x-1.5 sm:flex">
        {items.map((item, i) => (
          <Fragment key={item.href}>
            {i > 0 ? (
              <li aria-hidden className="text-muted/70">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
            ) : null}
            <li className="min-w-0">
              <BackLink href={item.href} className="hover:text-fg hover:underline">
                {item.label}
              </BackLink>
            </li>
          </Fragment>
        ))}
      </ol>
      {meta ? <span className="tabular">· {meta}</span> : null}
    </nav>
  );
}
