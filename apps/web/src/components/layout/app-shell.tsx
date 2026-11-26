'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { BarChart3, BriefcaseBusiness, CircleHelp, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquareText, Moon, Search, Settings, Sparkles, Sun, Target, Users, UsersRound, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FollowUpNotifier } from '@/components/follow-up/follow-up-notifier';
import { RunningTimer } from '@/components/projects/running-timer';
import { ReminderWatcher } from '@/components/tasks/reminder-watcher';
import { NavigationTracker } from './back-link';
import { UpdateWatcher } from './update-watcher';
import { OfflineOutbox } from './offline-outbox';
import { Avatar } from '@/components/ui/avatar';
import { startAppBootstrap, useMe, useRole, useSettings } from '@/lib/queries';
import { prospectorPageAllowed } from '@/lib/role-access';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { NotificationsBell } from './notifications-bell';
import { shortcutLabel, useQuickSearchShortcut } from './quick-search-shortcut';
import { ShortcutsDialog, useKeyboardShortcuts } from './keyboard-shortcuts';
import { useTheme } from './theme';

// Carregados à parte (não atrasam a primeira página): a pesquisa rápida e o Pomodoro.
const QuickSearch = dynamic(() => import('./quick-search').then((m) => m.QuickSearch), { ssr: false });
const PomodoroWatcher = dynamic(() => import('@/components/projects/pomodoro').then((m) => m.PomodoroWatcher), { ssr: false });

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p.startsWith('/dashboard') },
  { href: '/tarefas', label: 'Tarefas', icon: ListChecks, match: (p: string) => p.startsWith('/tarefas') },
  // O mapa abre-se a partir dos Leads ("Ver no mapa"), por isso conta como Leads.
  // O Kanban e o Mapa são a mesma lista vista de outra forma: mudam-se nos
  // Leads (Lista | Kanban | Mapa), por isso não ocupam lugar no menu.
  { href: '/leads', label: 'Leads', icon: Users, match: (p: string) => p === '/leads' || p.startsWith('/leads/') || p.startsWith('/mapa') || p.startsWith('/importar') || p.startsWith('/kanban') },
  { href: '/prospecao', label: 'Prospeção', icon: Target, match: (p: string) => p.startsWith('/prospecao'), feature: 'prospecting_session' as const },
  { href: '/gerar-leads', label: 'Gerar leads', short: 'Gerar', icon: Sparkles, match: (p: string) => p.startsWith('/gerar-leads') },
  { href: '/projetos', label: 'Clientes e projetos', short: 'Projetos', icon: BriefcaseBusiness, match: (p: string) => p.startsWith('/projetos'), feature: 'projects' as const },
  // Equipa de prospeção e colaboradores dos projetos, numa só página (separadores).
  { href: '/equipa', label: 'Equipa', icon: UsersRound, match: (p: string) => p === '/equipa' || p.startsWith('/colaboradores') },
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
/** `rail`: na barra estreita do tablet fica só o ícone (no menu do telemóvel os nomes ficam todos à vista). */
function SearchButton({ onClick, rail }: { onClick: () => void; rail?: boolean }) {
  const [label, setLabel] = useState('Ctrl K');
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- o sistema só se sabe no browser */
    setLabel(shortcutLabel());
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg',
        rail && 'max-lg:justify-center max-lg:px-0 max-lg:py-2.5',
      )}
    >
      <Search className={cn('h-4 w-4', rail && 'max-lg:h-5 max-lg:w-5')} aria-hidden />
      {/* Barra estreita (tablet): fica só o ícone, mas o nome continua lá para quem usa leitor de ecrã. */}
      <span className={cn('flex-1 text-left', rail && 'max-lg:sr-only')}>Pesquisar…</span>
      <kbd className={cn('rounded border border-border px-1.5 text-[11px]', rail && 'max-lg:hidden')}>{label}</kbd>
    </button>
  );
}

function NavLinks({ onNavigate, rail }: { onNavigate?: () => void; rail?: boolean }) {
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
              title={label}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                rail && 'max-lg:justify-center max-lg:px-0 max-lg:py-2.5',
                active ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className={cn('h-4 w-4', rail && 'max-lg:h-5 max-lg:w-5')} aria-hidden />
              <span className={cn(rail && 'max-lg:sr-only')}>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarFooter({ email, rail }: { email: string | null; rail?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { data: me } = useMe();
  const name = me?.profile.name ?? email?.split('@')[0] ?? '';
  return (
    <div className="flex w-full flex-col gap-1 border-t border-border pt-3">
      {/* A conta: foto, nome a mostrar e email; leva a Definições → Conta (nome, foto, palavra-passe, segurança). */}
      <Link
        href="/definicoes/conta"
        className={cn('group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2', rail && 'max-lg:justify-center max-lg:px-0')}
        title="Definições da conta"
      >
        <Avatar name={name || '?'} url={me?.profile.avatar_url} size={36} />
        <span className={cn('min-w-0 flex-1', rail && 'max-lg:sr-only')}>
          <span className="block truncate text-sm font-medium">{name}</span>
          {email ? <span className="block truncate text-xs text-muted">{email}</span> : null}
        </span>
        <Settings className={cn('h-4 w-4 shrink-0 text-muted group-hover:text-fg', rail && 'max-lg:hidden')} aria-hidden />
      </Link>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg',
            rail && 'max-lg:justify-center max-lg:px-0 max-lg:py-2',
          )}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" aria-hidden /> : <Moon className="h-4 w-4 shrink-0" aria-hidden />}
          <span className={cn(rail && 'max-lg:sr-only')}>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
        </button>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Terminar sessão"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg',
              rail && 'max-lg:justify-center max-lg:px-0 max-lg:py-2',
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span className={cn(rail && 'max-lg:sr-only')}>Terminar sessão</span>
          </button>
        </form>
      </div>
    </div>
  );
}

/** As páginas da barra de baixo (telemóvel), por ordem de uso; o resto fica em "Mais". */
const BOTTOM_ORDER = ['/dashboard', '/tarefas', '/leads', '/projetos', '/prospecao'];

function useBottomItems() {
  const items = useNavItems();
  const picked: typeof items = [];
  for (const href of BOTTOM_ORDER) {
    const item = items.find((i) => i.href === href);
    if (item) picked.push(item);
  }
  // Com funcionalidades desligadas (ou na equipa de prospeção) completa-se com as que houver.
  for (const item of items) {
    if (picked.length >= 4) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.slice(0, 4);
}

/**
 * Barra fixa em baixo (telemóvel): as quatro páginas mais usadas a um toque,
 * em vez de abrir o menu de cada vez. O "Mais" abre o menu com tudo o resto.
 */
function BottomBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const items = useBottomItems();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map(({ href, label, short, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium',
              active ? 'text-accent-text' : 'text-muted',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            <span className="max-w-full truncate">{short ?? label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium text-muted"
      >
        <Menu className="h-5 w-5" aria-hidden />
        Mais
      </button>
    </nav>
  );
}

export function AppShell({ email, children }: { email: string | null; children: ReactNode }) {
  // Um só pedido com o que todas as páginas pedem ao abrir (começa já, antes delas).
  useState(() => startAppBootstrap());
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
  const pages = [...useNavItems().map(({ href, label, icon }) => ({ href, label, icon })), { href: '/ajuda', label: 'Ajuda', icon: CircleHelp }];
  // Atalhos de teclado: só para as páginas do menu (o novo lead e o mapa vão com a lista de leads).
  const [showShortcuts, setShowShortcuts] = useState(false);
  const canOpen = (href: string) =>
    pages.some((p) => p.href === href) || ((href === '/leads/novo' || href === '/mapa') && pages.some((p) => p.href === '/leads'));
  useKeyboardShortcuts({ allowed: canOpen, onSearch: openSearch, onHelp: () => setShowShortcuts(true) });
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[4.5rem_1fr] lg:grid-cols-[15rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-3 focus:py-2"
      >
        Saltar para o conteúdo
      </a>

      {/* Barra lateral: estreita (só ícones) no tablet, completa no computador. */}
      {/* Ecrãs baixos: o menu faz scroll por dentro em vez de esticar a página (Leads e Kanban cabem no ecrã). */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border bg-surface py-5 [scrollbar-width:none] max-lg:items-center max-lg:px-2 md:flex lg:px-3">
        <div className="flex items-center justify-between gap-2 max-lg:flex-col max-lg:gap-3 lg:pl-3">
          <Link href="/dashboard">
            <Logo mark className="lg:hidden" />
            <Logo className="max-lg:hidden" />
          </Link>
          <NotificationsBell />
        </div>
        <nav aria-label="Principal" className="flex w-full flex-1 flex-col gap-3">
          <SearchButton onClick={openSearch} rail />
          <NavLinks rail />
        </nav>
        {/* Horas e Pomodoro são dos projetos: o prospetor não os usa. */}
        {role === 'prospector' ? null : (
          <>
            <RunningTimer />
            <PomodoroWatcher />
          </>
        )}
        <SidebarFooter email={email} rail />
      </aside>

      {/* Barra de cima (telemóvel): marca, cronómetro, avisos e pesquisa. As páginas estão na barra de baixo. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur min-[400px]:px-4 md:hidden">
        <Link href="/dashboard" className="shrink-0 whitespace-nowrap">
          <Logo />
          <span className="sr-only"> — Dashboard</span>
        </Link>
        {/* O cronómetro e os ícones num grupo só, sempre encostado à direita: sem
            cronómetro a contar, os ícones não se espalham pela barra. */}
        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          {role === 'prospector' ? null : <RunningTimer compact className="min-w-0 shrink" />}
          <NotificationsBell sheet />
          <button type="button" onClick={openSearch} className="rounded-lg p-2 text-fg hover:bg-surface-2" aria-label="Pesquisar">
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Menu com tudo (abre pelo "Mais" da barra de baixo). */}
      <RadixDialog.Root open={open} onOpenChange={setOpen}>
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
            <nav aria-label="Todas as páginas" className="flex-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            <SidebarFooter email={email} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      {/* pb: no telemóvel o conteúdo acaba acima da barra de baixo. */}
      <main id="conteudo" className="min-w-0 px-4 py-5 max-md:pb-24 sm:px-6 lg:px-8 lg:py-7">
        <OfflineOutbox />
        {blocked ? null : children}
      </main>

      <BottomBar onMore={() => setOpen(true)} />
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
