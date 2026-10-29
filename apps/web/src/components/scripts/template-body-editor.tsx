'use client';

/**
 * Texto de um modelo: editor formatado (emails) ou texto simples (WhatsApp,
 * chamada), sempre com as variáveis destacadas, o botão "Variável" e a lista
 * que abre ao escrever "{{".
 */
import { TEMPLATE_VARIABLES } from '@vndesign/core';
import { Braces } from 'lucide-react';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';

/** Variáveis agrupadas pelo que preenchem. */
export const VARIABLE_GROUPS = [
  { label: 'Do lead', keys: ['empresa', 'contacto', 'setor', 'cidade', 'problema', 'angulo', 'website', 'argumentos'] },
  { label: 'Dos serviços do lead', keys: ['servicos', 'categoria', 'beneficio'] },
  { label: 'Datas', keys: ['data', 'hoje'] },
  {
    label: 'Os teus dados',
    keys: ['meu_nome', 'meu_cargo', 'meu_telefone', 'meu_email', 'meu_site', 'portfolio', 'portfolio_design', 'projetos', 'assinatura', 'opt_out'],
  },
] as const;

type Variable = { key: string; label: string; group: string };

/** Todas as variáveis, pela ordem dos grupos (as que não estão num grupo vão para "Outras"). */
const ALL: Variable[] = (() => {
  const grouped = VARIABLE_GROUPS.flatMap((g) =>
    g.keys.flatMap((k) => {
      const v = TEMPLATE_VARIABLES.find((t) => t.key === k);
      return v ? [{ key: v.key, label: v.label, group: g.label }] : [];
    }),
  );
  const rest = TEMPLATE_VARIABLES.filter((v) => !grouped.some((g) => g.key === v.key)).map((v) => ({ key: v.key, label: v.label, group: 'Outras' }));
  return [...grouped, ...rest];
})();

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const matching = (query: string) => (query ? ALL.filter((v) => norm(v.key).includes(norm(query)) || norm(v.label).includes(norm(query))) : ALL);

type Menu = { source: 'button'; query: string } | { source: 'typing'; query: string; typed: number };

/** Caixa de texto simples com as variáveis destacadas por trás (o texto continua a ser da textarea). */
function PlainEditor({
  value,
  onChange,
  label,
  invalid,
  handleRef,
  toolbarEnd,
  onEditorKeyDown,
  onCaret,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  invalid?: boolean;
  handleRef: Ref<RichTextEditorHandle>;
  toolbarEnd: ReactNode;
  onEditorKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCaret: (before: string) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const caretAt = useRef<number | null>(null);

  useImperativeHandle(handleRef, () => ({
    focus: () => area.current?.focus(),
    insertText(text, replaceBefore = 0) {
      const el = area.current;
      const end = el?.selectionEnd ?? value.length;
      const start = Math.max(0, (el?.selectionStart ?? value.length) - replaceBefore);
      onChange(value.slice(0, start) + text + value.slice(end));
      caretAt.current = start + text.length;
    },
  }));

  // Depois de inserir, o cursor fica a seguir à variável.
  useEffect(() => {
    if (caretAt.current === null || !area.current) return;
    area.current.focus();
    area.current.setSelectionRange(caretAt.current, caretAt.current);
    caretAt.current = null;
  }, [value]);

  function caret() {
    const el = area.current;
    if (!el || el.selectionStart !== el.selectionEnd) return onCaret('');
    const before = el.value.slice(0, el.selectionStart);
    onCaret(before.slice(before.lastIndexOf('\n') + 1));
  }

  // Mesma letra, espaçamento e quebras de linha nas duas camadas.
  const text = 'px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words';
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border-input bg-surface-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40',
        invalid && 'border-danger',
      )}
    >
      <div className="flex items-center justify-end gap-0.5 border-b border-border bg-surface px-1.5 py-1">{toolbarEnd}</div>
      <div className="relative">
        <div ref={backdrop} aria-hidden className={cn(text, 'pointer-events-none absolute inset-0 overflow-hidden text-transparent')}>
          {value.split(/(\{\{[^{}]*\}\})/g).map((part, i) =>
            i % 2 ? (
              <mark key={i} className="rounded-sm bg-accent-soft text-transparent">
                {part}
              </mark>
            ) : (
              part
            ),
          )}
          {/* Uma linha vazia no fim também ocupa espaço. */}
          {'\n '}
        </div>
        <textarea
          ref={area}
          aria-label={label}
          aria-invalid={invalid || undefined}
          rows={14}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(caret);
          }}
          onKeyDown={onEditorKeyDown}
          onKeyUp={(e) => {
            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') caret();
          }}
          onClick={caret}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
          }}
          className={cn(text, 'relative block min-h-[16rem] w-full resize-y bg-transparent text-fg outline-none')}
        />
      </div>
    </div>
  );
}

export function TemplateBodyEditor({
  rich,
  value,
  onChange,
  invalid,
}: {
  /** Email: editor formatado. WhatsApp e chamada: texto simples. */
  rich: boolean;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const editor = useRef<RichTextEditorHandle>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [active, setActive] = useState(0);
  const items = useMemo(() => (menu ? matching(menu.query) : []), [menu]);

  function pick(v: Variable) {
    editor.current?.insertText(`{{${v.key}}}`, menu?.source === 'typing' ? menu.typed : 0);
    setMenu(null);
  }

  // A escrever: "{{emp" abre a lista já filtrada; sair do "{{" fecha-a.
  function onCaret(before: string) {
    const m = /\{\{\s*([a-z_]*)$/i.exec(before);
    if (m) {
      setMenu({ source: 'typing', query: m[1] ?? '', typed: m[0].length });
      setActive(0);
    } else if (menu?.source === 'typing') setMenu(null);
  }

  function onKey(e: KeyboardEvent<HTMLElement>) {
    if (!menu || !items.length) {
      if (menu && e.key === 'Escape') setMenu(null);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(items[Math.min(active, items.length - 1)]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMenu(null);
    }
  }

  const button = (
    <button
      type="button"
      data-variable-button
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setMenu((m) => (m?.source === 'button' ? null : { source: 'button', query: '' }));
        setActive(0);
      }}
      aria-expanded={menu?.source === 'button'}
      aria-haspopup="listbox"
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-surface-3 hover:text-fg',
        menu && 'bg-surface-3 text-fg',
      )}
    >
      <Braces className="h-3.5 w-3.5" aria-hidden /> Variável
    </button>
  );

  return (
    <div className="relative">
      {rich ? (
        <RichTextEditor
          label="Texto"
          value={value}
          onChange={onChange}
          aria-invalid={invalid}
          minHeight="16rem"
          handleRef={editor}
          highlightVariables
          toolbarEnd={button}
          onEditorKeyDown={onKey}
          onCaret={onCaret}
        />
      ) : (
        <PlainEditor
          value={value}
          onChange={onChange}
          label="Texto"
          invalid={invalid}
          handleRef={editor}
          toolbarEnd={button}
          onEditorKeyDown={onKey}
          onCaret={onCaret}
        />
      )}
      {menu ? (
        <VariableMenu
          menu={menu}
          items={items}
          active={active}
          onActive={setActive}
          onQuery={(query) => {
            setMenu({ source: 'button', query });
            setActive(0);
          }}
          onKey={onKey}
          onPick={pick}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <p className="mt-1 text-xs text-muted">
        Escreve <kbd className="rounded border border-border px-1 font-mono">{'{{'}</kbd> para escolher uma variável.{' '}
        <code className="font-mono">{'{{contacto|equipa}}'}</code> usa “equipa” quando o lead não tem contacto.
      </p>
    </div>
  );
}

function VariableMenu({
  menu,
  items,
  active,
  onActive,
  onQuery,
  onKey,
  onPick,
  onClose,
}: {
  menu: Menu;
  items: Variable[];
  active: number;
  onActive: (i: number) => void;
  onQuery: (q: string) => void;
  onKey: (e: KeyboardEvent<HTMLElement>) => void;
  onPick: (v: Variable) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const listId = 'variaveis-lista';

  // Clicar fora fecha.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      // O botão "Variável" abre e fecha sozinho.
      if (!box.current?.contains(target) && !target.closest?.('[data-variable-button]')) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  // A opção ativa fica sempre à vista.
  useEffect(() => {
    box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <div
      ref={box}
      className="absolute top-10 right-1 z-30 flex max-h-80 w-72 max-w-[calc(100%-0.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
    >
      {menu.source === 'button' ? (
        <input
          autoFocus
          aria-label="Procurar variável"
          aria-controls={listId}
          placeholder="Procurar variável…"
          value={menu.query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKey}
          className="h-9 border-b border-border bg-transparent px-3 text-sm outline-none"
        />
      ) : (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted">
          Enter ou Tab para inserir · Esc para fechar
        </p>
      )}
      <ul id={listId} role="listbox" aria-label="Variáveis" className="overflow-y-auto py-1">
        {items.length ? (
          items.map((v, i) => {
            const header = v.group !== lastGroup ? v.group : null;
            lastGroup = v.group;
            return (
              <li key={v.key} role="presentation">
                {header ? <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{header}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => onActive(i)}
                  onClick={() => onPick(v)}
                  className={cn('flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm', i === active && 'bg-surface-2')}
                >
                  <code className="shrink-0 font-mono text-xs text-accent-text">{`{{${v.key}}}`}</code>
                  <span className="truncate text-xs text-muted">{v.label}</span>
                </button>
              </li>
            );
          })
        ) : (
          <li className="px-3 py-2 text-sm text-muted">Nenhuma variável com esse nome.</li>
        )}
      </ul>
    </div>
  );
}
