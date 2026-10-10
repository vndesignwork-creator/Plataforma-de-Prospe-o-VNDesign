'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Secções das Definições: cada uma é uma página (/definicoes/<slug>). */
export const SETTINGS_SECTIONS = [
  { slug: 'assinatura', label: 'Assinatura' },
  { slug: 'lembretes', label: 'Follow-up e lembretes' },
  { slug: 'propostas', label: 'Propostas e IA' },
  { slug: 'listas-tarefas', label: 'Listas de tarefas' },
  { slug: 'setores', label: 'Setores' },
  { slug: 'nao-contactar', label: 'Não contactar' },
  { slug: 'api', label: 'API e integrações' },
  { slug: 'conta', label: 'Conta' },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secções das definições" className="-mx-4 border-b border-border px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <ul className="-mb-px flex gap-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SETTINGS_SECTIONS.map(({ slug, label }) => {
          const href = `/definicoes/${slug}`;
          const active = pathname === href;
          return (
            <li key={slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center border-b-2 px-3 transition-colors pointer-coarse:min-h-11',
                  active ? 'border-accent font-medium text-accent-text' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
