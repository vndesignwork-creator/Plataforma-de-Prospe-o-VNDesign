import { describe, expect, it } from 'vitest';
import {
  CommentCreateSchema,
  LeadTaskUpdateSchema,
  TaskListQuerySchema,
  arrangeCards,
  findMentions,
  isCardHidden,
  mentionParts,
  mentionQuery,
  taskGroup,
} from '../src';

const team = [
  { user_id: 'u-marta', name: 'Marta Silva' },
  { user_id: 'u-ana', name: 'Ana Rita' },
  { user_id: 'u-ana2', name: 'Ana Sousa' },
  { user_id: 'u-joao', name: 'João' },
];

describe('@menções', () => {
  it('nome completo, primeiro nome (se for único) e sem acentos nem maiúsculas', () => {
    expect(findMentions('@Marta Silva liga tu amanhã', team)).toEqual(['u-marta']);
    expect(findMentions('@marta vê isto', team)).toEqual(['u-marta']);
    expect(findMentions('@joao e @Ana Rita', team)).toEqual(['u-joao', 'u-ana']);
    // "Ana" é de duas pessoas: só o nome completo conta.
    expect(findMentions('@Ana ok', team)).toEqual([]);
    // Emails e palavras coladas não são menções; repetidas contam uma vez.
    expect(findMentions('escreve para marta@exemplo.pt', team)).toEqual([]);
    expect(findMentions('@Martas', team)).toEqual([]);
    expect(findMentions('@Marta, @Marta Silva!', team)).toEqual(['u-marta']);
  });

  it('pedaços para destacar', () => {
    expect(mentionParts('Olá @Marta Silva, liga.', team)).toEqual([
      { text: 'Olá ' },
      { text: '@Marta Silva', user_id: 'u-marta' },
      { text: ', liga.' },
    ]);
  });

  it('o texto a seguir ao @ que se está a escrever', () => {
    expect(mentionQuery('Olá @Ma', 7)).toEqual({ start: 4, query: 'Ma' });
    expect(mentionQuery('Olá @Ana Ri', 11)).toEqual({ start: 4, query: 'Ana Ri' });
    expect(mentionQuery('marta@exemplo', 13)).toBeNull();
    expect(mentionQuery('sem arroba', 10)).toBeNull();
  });

  it('comentário: texto obrigatório, até 20 menções', () => {
    expect(CommentCreateSchema.safeParse({ body: '  ' }).success).toBe(false);
    expect(CommentCreateSchema.parse({ body: 'ok' }).mentions).toEqual([]);
  });
});

describe('tarefas com responsável', () => {
  it('assigned_to e filtros da página Tarefas', () => {
    expect(LeadTaskUpdateSchema.parse({ assigned_to: null }).assigned_to).toBeNull();
    expect(LeadTaskUpdateSchema.safeParse({ assigned_to: 'x' }).success).toBe(false);
    expect(TaskListQuerySchema.parse({}).assigned).toBe('me');
    expect(TaskListQuerySchema.parse({ assigned: '8f0c3a52-6b8e-4f43-9a51-3a1f0b7d2c11' }).assigned).toBe('8f0c3a52-6b8e-4f43-9a51-3a1f0b7d2c11');
    expect(TaskListQuerySchema.safeParse({ assigned: 'eu' }).success).toBe(false);
  });

  it('grupos pelo prazo', () => {
    const today = '2026-10-24';
    const week = '2026-10-31';
    expect(taskGroup(null, today, week)).toBe('none');
    expect(taskGroup('2026-10-20', today, week)).toBe('overdue');
    expect(taskGroup(today, today, week)).toBe('today');
    expect(taskGroup('2026-10-31', today, week)).toBe('week');
    expect(taskGroup('2026-11-01', today, week)).toBe('later');
  });
});

describe('ordem dos cartões da ficha', () => {
  it('por omissão, a ordem de sempre', () => {
    expect(arrangeCards(null)).toEqual(['tasks', 'payments', 'projects', 'brand_kit', 'files', 'meetings', 'notes', 'proposals', 'contracts', 'activity']);
  });

  it('a ordem escolhida; cartões desconhecidos saem e os que faltam entram no sítio de sempre', () => {
    const order = arrangeCards({ order: ['activity', 'notes', 'tasks', 'antigo'] });
    expect(order.slice(0, 3)).toEqual(['activity', 'notes', 'proposals']);
    expect(order).toContain('payments');
    expect(order).not.toContain('antigo');
    expect(order.indexOf('payments')).toBe(order.indexOf('tasks') + 1);
    expect(new Set(order).size).toBe(10);
  });

  it('a Linha do tempo nunca se esconde', () => {
    expect(isCardHidden({ hidden: ['notes', 'activity'] }, 'notes')).toBe(true);
    expect(isCardHidden({ hidden: ['notes', 'activity'] }, 'activity')).toBe(false);
  });
});
