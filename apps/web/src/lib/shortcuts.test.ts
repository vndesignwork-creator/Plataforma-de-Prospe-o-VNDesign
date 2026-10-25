import { describe, expect, it } from 'vitest';
import { appendDictation } from './dictation';
import { isTypingTarget, resolveShortcut, shortcutList } from './shortcuts';

describe('atalhos de teclado', () => {
  it('N, / e ? fazem logo; G espera pela tecla seguinte', () => {
    expect(resolveShortcut('n', false)).toMatchObject({ href: '/leads/novo' });
    expect(resolveShortcut('N', false)).toMatchObject({ href: '/leads/novo' });
    expect(resolveShortcut('/', false)).toMatchObject({ action: 'search' });
    expect(resolveShortcut('?', false)).toMatchObject({ action: 'help' });
    expect(resolveShortcut('g', false)).toBe('g');
    expect(resolveShortcut('x', false)).toBeNull();
    expect(resolveShortcut('Enter', false)).toBeNull();
  });

  it('G + tecla vai para a página', () => {
    expect(resolveShortcut('d', true)).toMatchObject({ href: '/dashboard' });
    expect(resolveShortcut('P', true)).toMatchObject({ href: '/projetos' });
    expect(resolveShortcut('l', true)).toMatchObject({ href: '/leads' });
    // Depois do G, uma tecla sem página não faz nada (nem conta como N).
    expect(resolveShortcut('n', true)).toBeNull();
  });

  it('a lista só mostra as páginas a que a pessoa tem acesso', () => {
    const list = shortcutList((href) => href !== '/projetos' && href !== '/kanban');
    expect(list.some((s) => s.href === '/projetos')).toBe(false);
    expect(list.some((s) => s.href === '/kanban')).toBe(false);
    expect(list.find((s) => s.href === '/leads')?.keys).toEqual(['G', 'L']);
    expect(list.some((s) => s.action === 'help')).toBe(true);
  });

  it('sem alvo (ou um alvo que não é um elemento) não é "a escrever"', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe('ditado', () => {
  it('junta cada frase com um espaço e maiúscula no início', () => {
    expect(appendDictation('', 'liguei ao joão')).toBe('Liguei ao joão');
    expect(appendDictation('Liguei ao joão', 'quer orçamento')).toBe('Liguei ao joão quer orçamento');
    expect(appendDictation('Liguei ao João.', 'quer orçamento')).toBe('Liguei ao João. Quer orçamento');
    expect(appendDictation('Texto', '   ')).toBe('Texto');
  });
});
