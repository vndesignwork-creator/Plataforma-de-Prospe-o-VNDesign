/**
 * Atalhos de teclado (computador). Uma tecla (N, /, ?) ou G seguido de outra
 * para ir a uma página (como no Gmail): G A = Agenda, G P = Projetos…
 * Não contam quando se está a escrever num campo nem com uma janela aberta.
 */

export type Shortcut = { keys: string[]; label: string; href?: string; action?: 'search' | 'help' };

/** G + tecla → página. */
export const GO_SHORTCUTS: Record<string, { href: string; label: string }> = {
  d: { href: '/dashboard', label: 'Dashboard' },
  a: { href: '/agenda', label: 'Agenda' },
  l: { href: '/leads', label: 'Leads' },
  k: { href: '/kanban', label: 'Kanban' },
  p: { href: '/projetos', label: 'Projetos' },
  r: { href: '/prospecao', label: 'Prospeção' },
  m: { href: '/mapa', label: 'Mapa' },
  e: { href: '/estatisticas', label: 'Estatísticas' },
  s: { href: '/scripts', label: 'Scripts' },
};

export const SINGLE_SHORTCUTS: Shortcut[] = [
  { keys: ['N'], label: 'Novo lead', href: '/leads/novo' },
  { keys: ['/'], label: 'Pesquisar', action: 'search' },
  { keys: ['?'], label: 'Ver os atalhos', action: 'help' },
];

/** Todos os atalhos, para a janela de ajuda (só as páginas a que a pessoa tem acesso). */
export function shortcutList(allowed: (href: string) => boolean): Shortcut[] {
  return [
    ...SINGLE_SHORTCUTS.filter((s) => !s.href || allowed(s.href)),
    { keys: ['Ctrl', 'K'], label: 'Pesquisar (também ⌘K no Mac)', action: 'search' },
    ...Object.entries(GO_SHORTCUTS)
      .filter(([, v]) => allowed(v.href))
      .map(([key, v]) => ({ keys: ['G', key.toUpperCase()], label: v.label, href: v.href })),
  ];
}

/**
 * O que faz esta tecla, sabendo se a anterior foi um G (há menos de 1,5 s).
 * Devolve 'g' quando é o início de um "G + tecla".
 */
export function resolveShortcut(key: string, afterG: boolean): Shortcut | 'g' | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (afterG) {
    const go = GO_SHORTCUTS[k];
    return go ? { keys: ['G', k.toUpperCase()], label: go.label, href: go.href } : null;
  }
  if (k === 'g') return 'g';
  if (k === 'n') return SINGLE_SHORTCUTS[0]!;
  if (k === '/') return SINGLE_SHORTCUTS[1]!;
  if (k === '?') return SINGLE_SHORTCUTS[2]!;
  return null;
}

/** A tecla foi carregada enquanto se escreve (campo, área de texto, editor) ou com uma janela aberta? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="textbox"]');
}
