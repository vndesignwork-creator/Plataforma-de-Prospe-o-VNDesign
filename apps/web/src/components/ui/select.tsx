'use client';

/**
 * Lista de escolha com o aspeto da plataforma. No telemóvel a lista nativa abre o
 * seletor do sistema (fundo branco, rádios azuis); aqui abre o nosso menu.
 *
 * Por baixo continua um <select> nativo (escondido) que guarda o valor: funciona
 * igual com `value`/`onChange`, com o `register()` dos formulários, com as
 * etiquetas (<label htmlFor>) e com os leitores de ecrã e o teclado.
 */
import { ChevronDown } from 'lucide-react';
import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import {
  DropdownContent,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-border-input bg-surface-2 px-3 text-sm text-fg ' +
  'transition-colors hover:border-muted disabled:opacity-60';

interface Item {
  value: string;
  label: string;
  disabled?: boolean;
}
interface Group {
  label: string | null;
  items: Item[];
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** Lê as <option> e <optgroup> dos filhos (também dentro de fragmentos e listas). */
function readOptions(children: ReactNode): Group[] {
  const groups: Group[] = [{ label: null, items: [] }];
  const visit = (nodes: ReactNode, group: Group) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const el = child as ReactElement<{ value?: unknown; children?: ReactNode; label?: string; disabled?: boolean }>;
      if (el.type === 'option') {
        const label = textOf(el.props.children);
        group.items.push({ value: el.props.value === undefined ? label : String(el.props.value), label, disabled: el.props.disabled });
      } else if (el.type === 'optgroup') {
        const g: Group = { label: el.props.label ?? '', items: [] };
        groups.push(g);
        visit(el.props.children, g);
      } else {
        visit(el.props.children, group);
      }
    });
  };
  visit(children, groups[0]!);
  return groups.filter((g) => g.items.length);
}

const valueDescriptor = typeof window === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, onChange, onKeyDown, ...props },
  ref,
) {
  const native = useRef<HTMLSelectElement | null>(null);
  const [open, setOpen] = useState(false);
  // Aberto pelo teclado: ao fechar, o foco volta à lista (com o dedo/rato, não).
  const byKeyboard = useRef(false);
  // Valor quando a lista não é controlada (ex.: register() do formulário).
  const [domValue, setDomValue] = useState<string | null>(null);

  const setRefs = useCallback(
    (el: HTMLSelectElement | null) => {
      native.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
      if (!el || !valueDescriptor) return;
      setDomValue(el.value);
      // O formulário muda o valor por código (reset/setValue): acompanha-o.
      if (!(el as { __vndWatched?: boolean }).__vndWatched) {
        (el as { __vndWatched?: boolean }).__vndWatched = true;
        Object.defineProperty(el, 'value', {
          configurable: true,
          get: () => valueDescriptor.get!.call(el),
          set: (v: string) => {
            valueDescriptor.set!.call(el, v);
            setDomValue(valueDescriptor.get!.call(el));
          },
        });
        el.form?.addEventListener('reset', () => setTimeout(() => setDomValue(el.value)));
      }
    },
    [ref],
  );

  const groups = readOptions(children);
  const items = groups.flatMap((g) => g.items);
  const value = props.value !== undefined ? String(props.value) : (domValue ?? (props.defaultValue !== undefined ? String(props.defaultValue) : items[0]?.value ?? ''));
  const current = items.find((i) => i.value === value) ?? items[0];

  function choose(next: string) {
    const el = native.current;
    if (!el || next === value) return;
    el.value = next;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    setDomValue(e.target.value);
    onChange?.(e);
  }

  // Teclado: Enter, Espaço ou Alt+↓ abrem o nosso menu em vez da lista do sistema.
  function handleKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || props.disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault();
      byKeyboard.current = true;
      setOpen(true);
    }
  }

  const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';

  return (
    <>
      <select
        ref={setRefs}
        {...props}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="peer sr-only"
      >
        {children}
      </select>
      <DropdownRoot open={open} onOpenChange={setOpen}>
        <DropdownTrigger
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={props.disabled}
          className={cn(
            control,
            'flex h-10 min-w-0 items-center justify-between gap-2 text-left',
            'peer-focus-visible:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40',
            open && 'border-accent',
            invalid && 'border-danger',
            className,
          )}
        >
          <span className="truncate">{current?.label ?? ''}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </DropdownTrigger>
        <DropdownContent
          align="start"
          className="min-w-[max(var(--radix-dropdown-menu-trigger-width),10rem)]"
          onCloseAutoFocus={(e) => {
            // O botão é só visual: com o teclado, o foco volta à lista verdadeira.
            e.preventDefault();
            if (byKeyboard.current) native.current?.focus({ preventScroll: true });
            byKeyboard.current = false;
          }}
        >
          <DropdownRadioGroup value={String(items.indexOf(current!))} onValueChange={(i) => choose(items[Number(i)]!.value)}>
            {groups.map((g, gi) => (
              <div key={gi} role={g.label ? 'group' : undefined} aria-label={g.label ?? undefined}>
                {g.label ? <DropdownLabel>{g.label}</DropdownLabel> : null}
                {g.items.map((item) => {
                  const i = items.indexOf(item);
                  return (
                    <DropdownRadioItem key={i} value={String(i)} disabled={item.disabled}>
                      {item.label}
                    </DropdownRadioItem>
                  );
                })}
              </div>
            ))}
          </DropdownRadioGroup>
        </DropdownContent>
      </DropdownRoot>
    </>
  );
});
