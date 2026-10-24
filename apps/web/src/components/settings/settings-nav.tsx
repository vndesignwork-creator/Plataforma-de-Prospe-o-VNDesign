'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/lib/queries';
import { PROSPECTOR_SETTINGS } from '@/lib/role-access';
import { cn } from '@/lib/utils';

/** Secções das Definições: cada uma é uma página (/definicoes/<slug>). */
export const SETTINGS_SECTIONS = [
  { slug: 'assinatura', label: 'Assinatura' },
  { slug: 'email', label: 'Email de envio' },
  { slug: 'lembretes', label: 'Follow-up e lembretes' },
  { slug: 'funcionalidades', label: 'Funcionalidades' },
  { slug: 'servicos', label: 'Serviços' },
  { slug: 'propostas', label: 'Propostas' },
  { slug: 'ia', label: 'Inteligência artificial' },
  { slug: 'listas-tarefas', label: 'Listas de tarefas' },
  { slug: 'setores', label: 'Setores' },
  { slug: 'etiquetas', label: 'Etiquetas' },
  { slug: 'campos', label: 'Campos personalizados' },
  { slug: 'nao-contactar', label: 'Não contactar' },
  { slug: 'formulario', label: 'Formulário do site' },
  { slug: 'api', label: 'Acesso externo (API)' },
  { slug: 'conta', label: 'Conta' },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const role = useRole();
  // Prospetor: só a assinatura e a conta.
  const sections = SETTINGS_SECTIONS.filter((s) => role !== 'prospector' || PROSPECTOR_SETTINGS.has(s.slug));
  return (
    <nav aria-label="Secções das definições" className="-mx-4 border-b border-border px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <ul className="-mb-px flex gap-1 overflow-x-auto text-sm whitespace-nowrap [scrollbar-width:none] lg:flex-wrap lg:gap-x-0 [&::-webkit-scrollbar]:hidden">
        {sections.map(({ slug, label }) => {
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
