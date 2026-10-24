'use client';

/**
 * Caixa de texto com @menções: ao escrever "@" aparecem as pessoas da equipa
 * (setas e Enter, ou toque, para escolher). Também o texto com as menções
 * destacadas, para mostrar os comentários.
 */
import { mentionParts, mentionQuery, type MentionMember } from '@vndesign/core';
import { AtSign } from 'lucide-react';
import { useRef, useState, type ComponentProps } from 'react';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function MentionTextarea({
  value,
  onValueChange,
  members,
  ...props
}: Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  members: readonly MentionMember[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const query = mentionQuery(value, caret);
  const options = query && query.start !== dismissed ? members.filter((m) => fold(m.name).includes(fold(query.query))).slice(0, 6) : [];

  function pick(member: MentionMember) {
    if (!query) return;
    const next = `${value.slice(0, query.start)}@${member.name} ${value.slice(caret)}`;
    const pos = query.start + member.name.length + 2;
    onValueChange(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActive(0);
          setDismissed(null);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(options[Math.min(active, options.length - 1)]!);
              return;
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDismissed(query!.start);
              return;
            }
          }
          props.onKeyDown?.(e);
        }}
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
      />
      {options.length ? (
        <ul role="listbox" aria-label="Mencionar" className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border-strong bg-surface-2 p-1 shadow-card">
          {options.map((m, i) => (
            <li key={m.user_id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Sem perder o foco da caixa de texto.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', i === active ? 'bg-surface-3' : 'hover:bg-surface-3')}
              >
                <AtSign className="h-3.5 w-3.5 text-muted" aria-hidden />
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** O texto de um comentário com as @menções destacadas. */
export function MentionText({ text, members }: { text: string; members: readonly MentionMember[] }) {
  return (
    <>
      {mentionParts(text, members).map((p, i) =>
        p.user_id ? (
          <span key={i} className="font-medium text-accent-text">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
