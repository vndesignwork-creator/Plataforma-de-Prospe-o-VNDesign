'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { BarChart3, BriefcaseBusiness, CalendarDays, Columns3, Handshake, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquareText, Moon, Search, Settings, Sparkles, Sun, Target, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FollowUpNotifier } from '@/components/follow-up/follow-up-notifier';
import { PomodoroWatcher } from '@/components/projects/pomodoro';
import { RunningTimer } from '@/components/projects/running-timer';
import { ReminderWatcher } from '@/components/tasks/reminder-watcher';
import { NavigationTracker } from './back-link';
import { UpdateWatcher } from './update-watcher';
import { useRole, useSettings } from '@/lib/queries';
import { prospectorPageAllowed } from '@/lib/role-access';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { NotificationsBell } from './notifications-bell';
import { QuickSearch, shortcutLabel, useQuickSearchShortcut } from './quick-search';
import { ShortcutsDialog, useKeyboardShortcuts } from './keyboard-shortcuts';
import { useTheme } from './theme';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p.startsWith('/dashboard') },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, match: (p: string) => p.startsWith('/agenda') },
  { href: '/tarefas', label: 'Tarefas', icon: ListChecks, match: (p: string) => p.startsWith('/tarefas') },
  // O mapa abre-se a partir dos Leads ("Ver no mapa"), por isso conta como Leads.
  { href: '/leads', label: 'Leads', icon: Users, match: (p: string) => p === '/leads' || p.startsWith('/leads/') || p.startsWith('/mapa') || p.startsWith('/importar') },
  { href: '/prospecao', label: 'Prospeção', icon: Target, match: (p: string) => p.startsWith('/prospecao'), feature: 'prospecting_session' as const },
  { href: '/gerar-leads', label: 'Gerar leads', icon: Sparkles, match: (p: string) => p.startsWith('/gerar-leads') },
  { href: '/kanban', label: 'Kanban', icon: Columns3, match: (p: string) => p.startsWith('/kanban') },
  { href: '/projetos', label: 'Projetos', icon: BriefcaseBusiness, match: (p: string) => p.startsWith('/projetos'), feature: 'projects' as const },
  // Equipa de prospeção e colaboradores dos projetos, numa só página (separadores).
  { href: '/equipa', label: 'Equipa', icon: Handshake, match: (p: string) => p === '/equipa' || p.startsWith('/colaboradores') },
  { href: '/estatisticas', label: 'Estatísticas', icon: BarChart3, match: (p: string) => p.startsWith('/estatisticas') },
  { href: '/scripts', label: 'Scripts', icon: MessageSquareText, match: (p: string) => p.startsWith('/scripts') },
  { href: '/definicoes', label: 'Definições', icon: Settings, match: (p: string) => p.startsWith('/definicoes') },
];

/** As páginas do menu que esta pessoa vê. */
function useNavItems() {
  const { data: settings } = useSettings();
  // Funcionalidades desligadas (Definições → Funcionalidades) saem do menu.
  const role = useRole();
  return NAV.filter(
    (item) =>
      (!('feature' in item) || [item.feature].flat().every((f) => !f || settings?.features[f] !== false)) &&
      // Equipa de prospeção: só a parte comercial.
      (role !== 'prospector' || prospectorPageAllowed(item.href)),
  );
}

/** Botão "Pesquisar… Ctrl K" (barra lateral). */
function SearchButton({ onClick }: { onClick: () => void }) {
  const [label, setLabel] = useState('Ctrl K');
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- o sistema só se sabe no browser */
    setLabel(shortcutLabel());
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="flex-1 text-left">Pesquisar…</span>
      <kbd className="rounded border border-border px-1.5 text-[11px]">{label}</kbd>
    </button>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, match }) => {
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
  const role = useRole();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = role === 'prospector' && !prospectorPageAllowed(pathname);
  useEffect(() => {
    if (blocked) router.replace('/prospecao');
  }, [blocked, router]);
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useQuickSearchShortcut(openSearch);
  const pages = useNavItems().map(({ href, label, icon }) => ({ href, label, icon }));
  // Atalhos de teclado: só para as páginas do menu (o novo lead e o mapa vão com a lista de leads).
  const [showShortcuts, setShowShortcuts] = useState(false);
  const canOpen = (href: string) =>
    pages.some((p) => p.href === href) || ((href === '/leads/novo' || href === '/mapa') && pages.some((p) => p.href === '/leads'));
  useKeyboardShortcuts({ allowed: canOpen, onSearch: openSearch, onHelp: () => setShowShortcuts(true) });
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-3 focus:py-2"
      >
        Saltar para o conteúdo
      </a>

      {/* Barra lateral (computador) */}
      {/* Ecrãs baixos: o menu faz scroll por dentro em vez de esticar a página (Leads e Kanban cabem no ecrã). */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-3 py-5 [scrollbar-width:none] lg:flex">
        <div className="flex items-center justify-between gap-2 pl-3">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <NotificationsBell />
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-3">
          <SearchButton onClick={openSearch} />
          <NavLinks />
        </nav>
        {/* Horas e Pomodoro são dos projetos: o prospetor não os usa. */}
        {role === 'prospector' ? null : (
          <>
            <RunningTimer />
            <PomodoroWatcher />
          </>
        )}
        <SidebarFooter email={email} />
      </aside>

      {/* Barra superior (telemóvel/tablet) */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-1 border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="shrink-0 whitespace-nowrap">
          <Logo />
        </Link>
        {role === 'prospector' ? null : <RunningTimer compact className="ml-auto min-w-0 py-0.5" />}
        <NotificationsBell className={cn(role === 'prospector' && 'ml-auto')} />
        <button type="button" onClick={openSearch} className="rounded-lg p-2 text-fg hover:bg-surface-2" aria-label="Pesquisar">
          <Search className="h-5 w-5" aria-hidden />
        </button>
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
        {blocked ? null : children}
      </main>
      <QuickSearch
        open={searching}
        onOpenChange={setSearching}
        pages={pages}
        tasks={role !== 'prospector'}
        prospector={role === 'prospector'}
        onShortcuts={() => setShowShortcuts(true)}
      />
      <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} allowed={canOpen} />
      <FollowUpNotifier />
      <ReminderWatcher />
      <UpdateWatcher />
      <NavigationTracker />
    </div>
  );
}
