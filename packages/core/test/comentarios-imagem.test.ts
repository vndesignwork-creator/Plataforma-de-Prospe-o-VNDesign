import { describe, expect, it } from 'vitest';
import {
  DeliverablePinCreateSchema,
  pinTaskTitle,
  PIN_COMMENT_MAX,
  PublicPinCreateSchema,
  openPins,
  pinNumbers,
  type DeliverablePin,
} from '../src/project-tools';

describe('tarefa a partir do comentário', () => {
  it('junta a entrega e o comentário no título', () => {
    expect(pinTaskTitle('Homepage — versão 2', '  O botão   maior  ')).toBe('Homepage — versão 2: O botão maior');
  });

  it('não passa do tamanho máximo do título', () => {
    expect(pinTaskTitle('Entrega', 'a'.repeat(5000)).length).toBeLessThanOrEqual(2000);
  });
});

const pin = (over: Partial<DeliverablePin> & { id: string; created_at: string }): DeliverablePin => ({
  deliverable_id: 'd1',
  x: 10,
  y: 20,
  comment: 'Este botão maior',
  author: 'equipa',
  author_name: null,
  resolved_at: null,
  task_id: null,
  ...over,
});

describe('comentário novo na imagem', () => {
  it('guarda a posição em percentagem e o texto', () => {
    const parsed = DeliverablePinCreateSchema.parse({ x: '33.5', y: 80, comment: '  Trocar a foto  ' });
    expect(parsed).toEqual({ x: 33.5, y: 80, comment: 'Trocar a foto' });
  });

  it('recusa pontos fora da imagem e comentários vazios ou enormes', () => {
    expect(DeliverablePinCreateSchema.safeParse({ x: -1, y: 10, comment: 'olá' }).success).toBe(false);
    expect(DeliverablePinCreateSchema.safeParse({ x: 101, y: 10, comment: 'olá' }).success).toBe(false);
    expect(DeliverablePinCreateSchema.safeParse({ x: 10, y: 10, comment: '   ' }).success).toBe(false);
    expect(DeliverablePinCreateSchema.safeParse({ x: 10, y: 10, comment: 'a'.repeat(PIN_COMMENT_MAX + 1) }).success).toBe(false);
  });

  it('na página do cliente vai também o nome (opcional)', () => {
    expect(PublicPinCreateSchema.parse({ x: 1, y: 2, comment: 'olá', name: ' Ana ' }).name).toBe('Ana');
    expect(PublicPinCreateSchema.parse({ x: 1, y: 2, comment: 'olá' }).name).toBeUndefined();
  });
});

describe('marcas na imagem', () => {
  const pins = [
    pin({ id: 'b', created_at: '2026-11-19T10:00:00Z' }),
    pin({ id: 'a', created_at: '2026-11-18T09:00:00Z' }),
    pin({ id: 'c', created_at: '2026-11-19T12:00:00Z', resolved_at: '2026-11-19T13:00:00Z' }),
  ];

  it('numera pela ordem em que foram escritas (não pela ordem da lista)', () => {
    const numbers = pinNumbers(pins);
    expect(numbers.get('a')).toBe(1);
    expect(numbers.get('b')).toBe(2);
    expect(numbers.get('c')).toBe(3);
  });

  it('os por resolver saem pela ordem e sem os resolvidos', () => {
    expect(openPins(pins).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
