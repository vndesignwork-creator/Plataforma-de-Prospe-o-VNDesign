'use client';

/** Passos dentro de uma tarefa: marcar, escrever, tirar e acrescentar (na janela de editar). */
import { checklistProgress, type TaskChecklistItem } from '@vndesign/core';
import { ListChecks, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const newId = () => Math.random().toString(36).slice(2, 10);
export const MAX_STEPS = 30;

export function ChecklistEditor({ value, onChange, taskId }: { value: TaskChecklistItem[]; onChange: (next: TaskChecklistItem[]) => void; taskId: string }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const progress = checklistProgress(value);
  function add() {
    const text = draft.trim().slice(0, 200);
    if (!text || value.length >= MAX_STEPS) return;
    onChange([...value, { id: newId(), text, done: false }]);
    setDraft('');
    inputRef.current?.focus();
  }
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <ListChecks className="h-4 w-4 text-muted" aria-hidden /> Passos
        {progress ? <span className="text-xs font-normal text-muted tabular">({progress.done} de {progress.total})</span> : null}
      </p>
      {value.length ? (
        <ul className="mb-2 flex flex-col gap-1" aria-label="Passos da tarefa">
          {value.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => onChange(value.map((x) => (x.id === item.id ? { ...x, done: e.target.checked } : x)))}
                aria-label={`${item.done ? 'Desmarcar' : 'Marcar'} o passo: ${item.text}`}
                className="h-4 w-4 shrink-0 cursor-pointer"
              />
              <Input
                value={item.text}
                onChange={(e) => onChange(value.map((x) => (x.id === item.id ? { ...x, text: e.target.value.slice(0, 200) } : x)))}
                aria-label={`Passo ${i + 1}`}
                className={cn('h-9', item.done && 'text-muted line-through')}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.id !== item.id))}
                aria-label={`Tirar o passo: ${item.text}`}
                className="shrink-0 rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.length < MAX_STEPS ? (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={`task-step-${taskId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // Enter acrescenta o passo (não guarda a tarefa).
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={value.length ? 'Outro passo…' : 'Ex.: Escolher as cores'}
            aria-label="Novo passo"
            maxLength={200}
            className="h-9"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden /> Passo
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">No máximo {MAX_STEPS} passos.</p>
      )}
    </div>
  );
}

/** "☑ 2/3" ao lado do texto da tarefa (nada se a tarefa não tem passos). */
export function ChecklistChip({ checklist, onClick }: { checklist: readonly TaskChecklistItem[] | undefined; onClick?: () => void }) {
  const progress = checklistProgress(checklist);
  if (!progress) return null;
  const complete = progress.done === progress.total;
  const label = `Passos: ${progress.done} de ${progress.total}`;
  const className = cn(
    'inline-flex items-center gap-1 rounded px-1.5 text-xs whitespace-nowrap tabular',
    complete ? 'bg-success/15 text-success' : 'bg-surface-3 text-muted',
    onClick && 'hover:text-fg',
  );
  const content = (
    <>
      <ListChecks className="h-3 w-3" aria-hidden />
      <span className="sr-only">{label}</span>
      <span aria-hidden>
        {progress.done}/{progress.total}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className} title={label}>
      {content}
    </button>
  ) : (
    <span className={className} title={label}>
      {content}
    </span>
  );
}
