import { describe, expect, it } from 'vitest';
import {
  LeadTaskCreateSchema,
  LeadTaskReorderSchema,
  LeadTaskUpdateSchema,
  TaskTemplateCreateSchema,
  TaskTemplateUpdateSchema,
  splitTasks,
  suggestTaskTemplates,
} from '../src/tasks';

describe('tarefas: schemas', () => {
  it('tarefa nova: texto obrigatório e prazo opcional', () => {
    expect(LeadTaskCreateSchema.parse({ title: '  Pedir fotos ' })).toEqual({ title: 'Pedir fotos', due_on: null });
    expect(LeadTaskCreateSchema.parse({ title: 'Maquete', due_on: '2026-10-20' }).due_on).toBe('2026-10-20');
    expect(LeadTaskCreateSchema.parse({ title: 'Maquete', due_on: '' }).due_on).toBeNull();
    expect(LeadTaskCreateSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(LeadTaskCreateSchema.safeParse({ title: 'x', due_on: '20/10/2026' }).success).toBe(false);
  });

  it('editar não inventa campos', () => {
    expect(LeadTaskUpdateSchema.parse({ done: true })).toEqual({ done: true });
    expect(LeadTaskUpdateSchema.parse({ due_on: null })).toEqual({ due_on: null });
  });

  it('reordenar recusa ids repetidos', () => {
    const id = '5f1d7e1a-0c51-4a51-9a39-3f4f0d6a1b2c';
    expect(LeadTaskReorderSchema.safeParse({ ids: [id, id] }).success).toBe(false);
    expect(LeadTaskReorderSchema.safeParse({ ids: [id] }).success).toBe(true);
  });

  it('lista-modelo: linhas vazias saem e é preciso pelo menos uma tarefa', () => {
    expect(TaskTemplateCreateSchema.parse({ name: 'Site', items: ['A', '', ' B '] })).toEqual({
      name: 'Site',
      service: null,
      items: ['A', 'B'],
    });
    expect(TaskTemplateCreateSchema.safeParse({ name: 'Site', items: ['', ' '] }).success).toBe(false);
    expect(TaskTemplateCreateSchema.safeParse({ name: 'Site', service: 'outro', items: ['A'] }).success).toBe(false);
    // Editar só o nome não mexe nas tarefas nem no serviço.
    expect(TaskTemplateUpdateSchema.parse({ name: 'Novo nome' })).toEqual({ name: 'Novo nome' });
  });
});

describe('tarefas: utilitários', () => {
  it('splitTasks: por fazer pela posição, concluídas das mais recentes', () => {
    const tasks = [
      { id: 'a', position: 3, done_at: null },
      { id: 'b', position: 1, done_at: null },
      { id: 'c', position: 2, done_at: '2026-10-01T10:00:00Z' },
      { id: 'd', position: 4, done_at: '2026-10-05T10:00:00Z' },
    ];
    const { pending, done } = splitTasks(tasks);
    expect(pending.map((t) => t.id)).toEqual(['b', 'a']);
    expect(done.map((t) => t.id)).toEqual(['d', 'c']);
  });

  it('suggestTaskTemplates: as listas dos serviços do lead, pela ordem do catálogo', () => {
    const templates = [
      { id: '1', service: 'identidade_visual' as const },
      { id: '2', service: 'site_institucional' as const },
      { id: '3', service: null },
      { id: '4', service: 'estampas' as const },
    ];
    expect(suggestTaskTemplates(templates, ['identidade_visual', 'site_institucional']).map((t) => t.id)).toEqual(['2', '1']);
    expect(suggestTaskTemplates(templates, [])).toEqual([]);
  });
});
