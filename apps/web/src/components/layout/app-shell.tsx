'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { BarChart3, BookOpen, Columns3, FileUp, LayoutDashboard, LogOut, Menu, MessageSquareText, Moon, Settings, Sun, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { FollowUpNotifier } from '@/components/follow-up/follow-up-notifier';
import { ReminderWatcher } from '@/components/tasks/reminder-watcher';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { useTheme } from './theme';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p.startsWith('/dashboard') },
  // O mapa abre-se a partir dos Leads ("Ver no mapa"), por isso conta como Leads.
  { href: '/leads', label: 'Leads', icon: Users, match: (p: string) => p === '/leads' || p.startsWith('/leads/') || p.startsWith('/mapa') },
  { href: '/kanban', label: 'Kanban', icon: Columns3, match: (p: string) => p.startsWith('/kanban') },
  { href: '/estatisticas', label: 'Estatísticas', icon: BarChart3, match: (p: string) => p.startsWith('/estatisticas') },
  { href: '/scripts', label: 'Scripts', icon: MessageSquareText, match: (p: string) => p.startsWith('/scripts') },
  { href: '/importar', label: 'Importar', icon: FileUp, match: (p: string) => p.startsWith('/importar') },
  { href: '/definicoes', label: 'Definições', icon: Settings, match: (p: string) => p.startsWith('/definicoes') },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
      <li>
        <a
          href="/docs/api"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          API
          <span className="sr-only">(abre num novo separador)</span>
        </a>
      </li>
    </ul>
  );
}

function SidebarFooter({ email }: { email: string | null }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      </button>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Terminar sessão
        </button>
      </form>
      {email ? <p className="truncate px-3 text-xs text-muted" title={email}>{email}</p> : null}
    </div>
  );
}

export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-3 focus:py-2"
      >
        Saltar para o conteúdo
      </a>

      {/* Barra lateral (computador) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:flex">
        <Link href="/dashboard" className="px-3">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex-1">
          <NavLinks />
        </nav>
        <SidebarFooter email={email} />
      </aside>

      {/* Barra superior (telemóvel/tablet) */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard">
          <Logo />
        </Link>
        <RadixDialog.Root open={open} onOpenChange={setOpen}>
          <RadixDialog.Trigger className="rounded-lg p-2 text-fg hover:bg-surface-2" aria-label="Abrir menu">
            <Menu className="h-5 w-5" aria-hidden />
          </RadixDialog.Trigger>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
            <RadixDialog.Content className="fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 border-l border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <RadixDialog.Title className="font-display text-lg font-semibold">Menu</RadixDialog.Title>
                <RadixDialog.Description className="sr-only">Navegação principal</RadixDialog.Description>
                <RadixDialog.Close className="rounded-lg p-2 hover:bg-surface-2" aria-label="Fechar menu">
                  <X className="h-5 w-5" aria-hidden />
                </RadixDialog.Close>
              </div>
              <nav aria-label="Principal" className="flex-1">
                <NavLinks onNavigate={() => setOpen(false)} />
              </nav>
              <SidebarFooter email={email} />
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </header>

      <main id="conteudo" className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {children}
      </main>
      <FollowUpNotifier />
      <ReminderWatcher />
    </div>
  );
}
