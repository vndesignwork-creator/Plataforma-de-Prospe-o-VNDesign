import type { KeyboardEvent } from 'react';

/**
 * Teclado nas abas (role="tablist") e grupos de opção (role="radiogroup"), como
 * manda o padrão ARIA: o Tab entra só na opção escolhida e as setas, Home e End
 * mudam de opção (e escolhem-na logo).
 */
export function rovingKeyDown(e: KeyboardEvent<HTMLElement>) {
  const tabs = e.currentTarget.getAttribute('role') === 'tablist';
  const back = tabs ? ['ArrowLeft'] : ['ArrowLeft', 'ArrowUp'];
  const forward = tabs ? ['ArrowRight'] : ['ArrowRight', 'ArrowDown'];
  if (![...back, ...forward, 'Home', 'End'].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(tabs ? '[role="tab"]' : '[role="radio"]')).filter(
    (el) => !el.hasAttribute('disabled'),
  );
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (back.includes(e.key) ? -1 : 1) + items.length) % items.length;
  items[next]!.focus();
  items[next]!.click();
}

/** tabIndex de cada opção: só a escolhida (ou a primeira, se nenhuma estiver) entra no Tab. */
export function rovingTabIndex(selected: boolean, index: number, anySelected = true): 0 | -1 {
  return selected || (!anySelected && index === 0) ? 0 : -1;
}
