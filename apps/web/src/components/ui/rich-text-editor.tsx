'use client';

/**
 * Editor de texto formatado para emails (sem bibliotecas): negrito, itálico,
 * sublinhado, riscado, listas, citação, alinhamento, link, limpar formatação,
 * desfazer/refazer. O valor é HTML limpo (ver sanitizeRichHtml em @vndesign/core);
 * aceita também texto simples (modelos, IA, emails antigos), que passa a parágrafos.
 */
import { sanitizeRichHtml, toRichHtml } from '@vndesign/core';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/utils';

/** Para quem usa o editor por fora (ex.: inserir uma variável no sítio do cursor). */
export type RichTextEditorHandle = {
  /** Insere texto onde estava o cursor; `replaceBefore` apaga antes N caracteres (o "{{emp" já escrito). */
  insertText: (text: string, replaceBefore?: number) => void;
  focus: () => void;
};

// Variáveis destacadas ({{empresa}}): um só Highlight para todos os editores da página.
const VARIABLE = /\{\{[^{}]*\}\}/g;
const highlighted = new Map<HTMLElement, Range[]>();
function refreshHighlights() {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
  const ranges = [...highlighted.values()].flat();
  if (ranges.length) CSS.highlights.set('tpl-var', new Highlight(...ranges));
  else CSS.highlights.delete('tpl-var');
}
function highlightVariablesIn(el: HTMLElement) {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const m of (node.textContent ?? '').matchAll(VARIABLE)) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      ranges.push(range);
    }
  }
  highlighted.set(el, ranges);
  refreshHighlights();
}

type Command = { cmd: string; icon: LucideIcon; label: string; value?: string; state?: boolean };

const GROUPS: Command[][] = [
  [
    { cmd: 'undo', icon: Undo2, label: 'Desfazer (Ctrl+Z)' },
    { cmd: 'redo', icon: Redo2, label: 'Refazer (Ctrl+Y)' },
  ],
  [
    { cmd: 'bold', icon: Bold, label: 'Negrito (Ctrl+B)', state: true },
    { cmd: 'italic', icon: Italic, label: 'Itálico (Ctrl+I)', state: true },
    { cmd: 'underline', icon: Underline, label: 'Sublinhado (Ctrl+U)', state: true },
    { cmd: 'strikeThrough', icon: Strikethrough, label: 'Riscado', state: true },
  ],
  [
    { cmd: 'insertUnorderedList', icon: List, label: 'Lista com pontos', state: true },
    { cmd: 'insertOrderedList', icon: ListOrdered, label: 'Lista numerada', state: true },
    { cmd: 'formatBlock', value: 'blockquote', icon: Quote, label: 'Citação' },
  ],
  [
    { cmd: 'justifyLeft', icon: AlignLeft, label: 'Alinhar à esquerda', state: true },
    { cmd: 'justifyCenter', icon: AlignCenter, label: 'Centrar', state: true },
    { cmd: 'justifyRight', icon: AlignRight, label: 'Alinhar à direita', state: true },
  ],
  [
    { cmd: 'createLink', icon: Link2, label: 'Inserir link' },
    { cmd: 'unlink', icon: Link2Off, label: 'Tirar o link' },
    { cmd: 'removeFormat', icon: RemoveFormatting, label: 'Limpar a formatação' },
  ],
];

export function RichTextEditor({
  value,
  onChange,
  label,
  id,
  minHeight = '16rem',
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  handleRef,
  highlightVariables = false,
  toolbarEnd,
  onEditorKeyDown,
  onCaret,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Nome acessível (o editor não é um campo de formulário normal). */
  label: string;
  id?: string;
  minHeight?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  handleRef?: Ref<RichTextEditorHandle>;
  /** Destaca as variáveis dos modelos ({{empresa}}…). */
  highlightVariables?: boolean;
  /** Botões extra no fim da barra (ex.: "Variável"). */
  toolbarEnd?: ReactNode;
  /** Teclas antes do editor (ex.: setas e Enter numa lista aberta); preventDefault para as tratar. */
  onEditorKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Texto do parágrafo antes do cursor, a cada tecla (ex.: abrir a lista de variáveis com "{{"). */
  onCaret?: (before: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // O último HTML que saiu daqui: um valor novo vindo de fora (outro modelo, a IA) substitui o conteúdo.
  const emitted = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  // Onde estava o cursor (para inserir depois de clicar num botão ou numa lista fora do editor).
  const saved = useRef<Range | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === emitted.current) return;
    el.innerHTML = toRichHtml(value);
    emitted.current = value;
    if (highlightVariables) highlightVariablesIn(el);
  }, [value, highlightVariables]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !highlightVariables) return;
    highlightVariablesIn(el);
    return () => {
      highlighted.delete(el);
      refreshHighlights();
    };
  }, [highlightVariables]);

  useEffect(() => {
    const onSelection = () => {
      const sel = window.getSelection();
      if (sel?.rangeCount && ref.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  useImperativeHandle(handleRef, () => ({
    focus: () => ref.current?.focus(),
    insertText(text, replaceBefore = 0) {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (sel && saved.current && !el.contains(sel.anchorNode)) {
        sel.removeAllRanges();
        sel.addRange(saved.current);
      }
      for (let i = 0; i < replaceBefore; i++) sel?.modify('extend', 'backward', 'character');
      document.execCommand('insertText', false, text);
      emit();
    },
  }));

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    emitted.current = html;
    onChange(html);
    if (highlightVariables) highlightVariablesIn(el);
  }

  function caret() {
    if (!onCaret) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!sel?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node)) return onCaret('');
    onCaret((node.textContent ?? '').slice(0, sel.anchorOffset));
  }

  function refreshState() {
    const next: Record<string, boolean> = {};
    for (const group of GROUPS) for (const c of group) if (c.state) next[c.cmd] = safeState(c.cmd);
    setActive(next);
  }

  function run(c: Command) {
    ref.current?.focus();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    if (c.cmd === 'createLink') {
      const url = window.prompt('Endereço do link (https://…)', 'https://');
      if (!url || !/^(https?:\/\/|mailto:)\S+$/i.test(url.trim())) return;
      const selection = window.getSelection();
      if (selection && selection.isCollapsed) document.execCommand('insertText', false, url.trim());
      document.execCommand('createLink', false, url.trim());
    } else if (c.cmd === 'formatBlock') {
      // Segunda vez: volta a parágrafo normal.
      const inQuote = !!window.getSelection()?.anchorNode?.parentElement?.closest('blockquote');
      document.execCommand('formatBlock', false, inQuote ? 'p' : (c.value ?? 'p'));
    } else {
      document.execCommand(c.cmd, false, c.value);
    }
    emit();
    refreshState();
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    // Colar de outra página ou do Word: só a formatação que o email aceita.
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) document.execCommand('insertHTML', false, sanitizeRichHtml(html));
    else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    emit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    onEditorKeyDown?.(e);
    if (e.defaultPrevented) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      run(GROUPS[4]![0]!);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border-input bg-surface-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40',
        invalid && 'border-danger',
        className,
      )}
    >
      <div role="toolbar" aria-label="Barra de formatação" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-1.5 py-1">
        {GROUPS.map((group, i) => (
          <div key={i} className={cn('flex items-center gap-0.5', i > 0 && 'border-l border-border pl-1')}>
            {group.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.cmd + (c.value ?? '')}
                  type="button"
                  // Sem roubar o foco: a seleção no texto mantém-se.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(c)}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={c.state ? !!active[c.cmd] : undefined}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg',
                    active[c.cmd] && 'bg-surface-3 text-fg',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
              );
            })}
          </div>
        ))}
        {toolbarEnd ? <div className="ml-auto flex items-center gap-0.5 border-l border-border pl-1">{toolbarEnd}</div> : null}
      </div>
      <div
        ref={ref}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          emit();
          caret();
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          refreshState();
          // Setas e Home/End mudam o sítio do cursor (a escrita já passa por onInput).
          if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') caret();
        }}
        onMouseUp={() => {
          refreshState();
          caret();
        }}
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
        style={{ minHeight }}
        className={cn(
          'max-h-[32rem] overflow-y-auto px-3 py-2 text-sm leading-relaxed text-fg outline-none',
          '[&_a]:text-accent-text [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
        )}
      />
    </div>
  );
}

function safeState(cmd: string): boolean {
  try {
    return document.queryCommandState(cmd);
  } catch {
    return false;
  }
}
