import { describe, expect, it } from 'vitest';
import {
  LeadBulkActionSchema,
  LeadTagRenameSchema,
  NoteSearchQuerySchema,
  RescheduleSchema,
  chunkReschedule,
  noteSnippet,
  rescheduleDate,
  reschedulePlan,
} from '../src';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('ações em massa', () => {
  it('etiqueta e estado são obrigatórios nas ações respetivas', () => {
    expect(LeadBulkActionSchema.safeParse({ action: 'tag_add', ids: [id(1)] }).success).toBe(false);
    expect(LeadBulkActionSchema.safeParse({ action: 'tag_add', ids: [id(1)], tag: ' , ' }).success).toBe(false);
    expect(LeadBulkActionSchema.safeParse({ action: 'tag_add', ids: [id(1)], tag: 'feira' }).success).toBe(true);
    expect(LeadBulkActionSchema.safeParse({ action: 'status', ids: [id(1)] }).success).toBe(false);
    expect(LeadBulkActionSchema.safeParse({ action: 'status', ids: [id(1)], status: 'contactado' }).success).toBe(true);
    expect(LeadBulkActionSchema.safeParse({ action: 'archive', ids: [id(1)] }).success).toBe(true);
  });

  it('renomear etiqueta: o nome novo fica limpo; null apaga', () => {
    expect(LeadTagRenameSchema.parse({ from: 'feira', to: '  Feira   de março ' })).toEqual({ from: 'feira', to: 'Feira de março' });
    expect(LeadTagRenameSchema.parse({ from: 'feira', to: null })).toEqual({ from: 'feira', to: null });
    expect(LeadTagRenameSchema.safeParse({ from: 'feira', to: ' ' }).success).toBe(false);
  });
});

describe('mudar datas (Pôr em dia, follow-up, Anular)', () => {
  it('hoje, amanhã e a próxima semana (a segunda-feira seguinte)', () => {
    // 2026-10-24 é sábado.
    expect(rescheduleDate('today', '2026-10-24')).toBe('2026-10-24');
    expect(rescheduleDate('tomorrow', '2026-10-24')).toBe('2026-10-25');
    expect(rescheduleDate('next_week', '2026-10-24')).toBe('2026-10-26');
    // Numa segunda-feira, a próxima semana é a segunda seguinte.
    expect(rescheduleDate('next_week', '2026-10-26')).toBe('2026-11-02');
  });

  it('o plano tem o pedido e o "Anular" com as datas de antes', () => {
    const plan = reschedulePlan(
      [
        { id: id(1), next_action_on: '2026-10-01' },
        { id: id(2), next_action_on: null },
      ],
      [{ id: id(3), due_on: '2026-10-20' }],
      '2026-10-27',
    );
    expect(plan.apply).toEqual({
      leads: [
        { id: id(1), next_action_on: '2026-10-27' },
        { id: id(2), next_action_on: '2026-10-27' },
      ],
      tasks: [{ id: id(3), due_on: '2026-10-27' }],
    });
    expect(plan.undo.leads).toEqual([
      { id: id(1), next_action_on: '2026-10-01' },
      { id: id(2), next_action_on: null },
    ]);
    expect(plan.undo.tasks).toEqual([{ id: id(3), due_on: '2026-10-20' }]);
  });

  it('pedidos grandes vão em blocos de 200; vazio não é válido', () => {
    const leads = Array.from({ length: 450 }, (_, i) => ({ id: id(i), next_action_on: '2026-10-27' }));
    const parts = chunkReschedule({ leads, tasks: [{ id: id(999), due_on: null }] });
    expect(parts.map((p) => p.leads?.length)).toEqual([200, 200, 50]);
    expect(parts.map((p) => p.tasks?.length)).toEqual([1, 0, 0]);
    for (const p of parts) expect(RescheduleSchema.safeParse(p).success).toBe(true);
    expect(RescheduleSchema.safeParse({}).success).toBe(false);
    expect(RescheduleSchema.safeParse({ leads: [{ id: id(1), next_action_on: '27/10/2026' }] }).success).toBe(false);
  });
});

describe('pesquisa nas notas', () => {
  it('excerto à volta do texto, sem contar acentos nem maiúsculas', () => {
    const body = 'Liguei ao dono. Disse que precisa de uma LOJA ONLINE até ao Natal e que o orçamento é de 2000 €. Voltar a ligar na segunda.';
    const snip = noteSnippet(body, 'loja online', 15);
    expect(snip).toContain('LOJA ONLINE');
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(noteSnippet('Reunião às 15h com a Clínica', 'reuniao', 50)).toBe('Reunião às 15h com a Clínica');
    // Emojis antes não baralham as posições.
    expect(noteSnippet('📞🎉 falámos do orçamento', 'orcamento', 3)).toBe('…do orçamento');
    // Sem ocorrência: o início.
    expect(noteSnippet('abc', 'xyz')).toBe('abc');
  });

  it('pelo menos 2 letras', () => {
    expect(NoteSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(NoteSearchQuerySchema.parse({ q: 'loja' })).toEqual({ q: 'loja', limit: 6 });
  });
});
