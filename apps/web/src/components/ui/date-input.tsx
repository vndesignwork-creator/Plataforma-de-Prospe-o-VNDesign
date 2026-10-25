'use client';

/**
 * Campos de data com calendário próprio (em vez do calendário do browser, que no
 * Windows aparece com o azul do sistema). Escreve-se "15/10/2026" ou escolhe-se no
 * calendário; no telemóvel, tocar no campo abre logo o calendário (sem teclado).
 * Valores: "AAAA-MM-DD" (DateInput) e "AAAA-MM-DDTHH:MM" na hora local (DateTimeInput).
 */
import * as Popover from '@radix-ui/react-popover';
import { todayIso } from '@vndesign/core';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import {
  MONTHS_PT,
  WEEKDAYS_PT,
  formatDateText,
  formatDateTimeText,
  monthGrid,
  parseDateText,
  parseDateTimeText,
  parseTimeText,
  shiftDays,
  shiftMonths,
} from '@/lib/date-input';
import { cn } from '@/lib/utils';

const control =
  'h-10 w-full rounded-lg border border-border-input bg-surface-2 pr-10 pl-3 text-sm text-fg placeholder:text-muted ' +
  'transition-colors hover:border-muted focus-visible:border-accent focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 aria-[invalid=true]:border-danger';

const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia('(pointer: coarse)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** Ecrã tátil: o campo abre o calendário em vez do teclado. */
function useCoarsePointer() {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia('(pointer: coarse)').matches, () => false);
}

/** Só aceita a data enquanto se escreve quando o ano tem 4 algarismos ("15/10/20" ainda não é 2020). */
const parseWhileTyping = (text: string) => (/\d{4}/.test(text) ? parseDateText(text) : null);

interface CalendarProps {
  value: string;
  onSelect: (iso: string) => void;
  min?: string;
  max?: string;
  footer?: ReactNode;
}

/** Grelha do mês (segunda a domingo), com teclado: setas, Page Up/Down (mês), Início/Fim (semana). */
export function Calendar({ value, onSelect, min, max, footer }: CalendarProps) {
  const today = todayIso();
  const [focus, setFocus] = useState(value || today);
  const grid = monthGrid(focus);
  const month = Number(focus.slice(5, 7));
  const year = Number(focus.slice(0, 4));
  const gridRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // Depois de mudar o dia com o teclado, o foco acompanha (a grelha é redesenhada).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const disabled = (iso: string) => (min !== undefined && iso < min) || (max !== undefined && iso > max);

  function onKeyDown(e: KeyboardEvent) {
    const weekday = (new Date(`${focus}T12:00:00Z`).getUTCDay() + 6) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => shiftDays(focus, -1),
      ArrowRight: () => shiftDays(focus, 1),
      ArrowUp: () => shiftDays(focus, -7),
      ArrowDown: () => shiftDays(focus, 7),
      PageUp: () => shiftMonths(focus, -1),
      PageDown: () => shiftMonths(focus, 1),
      Home: () => shiftDays(focus, -weekday),
      End: () => shiftDays(focus, 6 - weekday),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    moved.current = true;
    setFocus(move());
  }

  return (
    <div className="w-[17.5rem] select-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setFocus(shiftMonths(focus, -1))}
          aria-label="Mês anterior"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold" aria-live="polite">
          {MONTHS_PT[month - 1]} de {year}
        </p>
        <button
          type="button"
          onClick={() => setFocus(shiftMonths(focus, 1))}
          aria-label="Mês seguinte"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div role="grid" aria-label={`${MONTHS_PT[month - 1]} de ${year}`} ref={gridRef} onKeyDown={onKeyDown}>
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS_PT.map((d) => (
            <span key={d} role="columnheader" className="py-1 text-center text-xs font-medium text-muted">
              {d}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {grid.slice(week * 7, week * 7 + 7).map((iso) => {
              const inMonth = Number(iso.slice(5, 7)) === month;
              const selected = iso === value;
              const isToday = iso === today;
              const off = disabled(iso);
              return (
                <span key={iso} role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    data-day={iso}
                    tabIndex={iso === focus ? 0 : -1}
                    disabled={off}
                    onClick={() => onSelect(iso)}
                    onFocus={() => iso !== focus && setFocus(iso)}
                    aria-label={`${Number(iso.slice(8, 10))} de ${MONTHS_PT[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}${isToday ? ' (hoje)' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'm-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm tabular transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none',
                      selected
                        ? 'bg-accent font-semibold text-accent-fg'
                        : isToday
                          ? 'border border-accent/70 text-accent-text hover:bg-surface-3'
                          : inMonth
                            ? 'text-fg hover:bg-surface-3'
                            : 'text-muted/60 hover:bg-surface-3',
                      off && 'cursor-not-allowed opacity-30 hover:bg-transparent',
                    )}
                  >
                    {Number(iso.slice(8, 10))}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {footer ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">{footer}</div> : null}
    </div>
  );
}

const footerButton = 'rounded-md px-2 py-1 text-sm font-medium text-accent-text hover:bg-surface-3';

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia('(min-width: 1024px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** Computador: há largura para abrir o calendário ao lado do campo. */
function useWideScreen() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia('(min-width: 1024px)').matches, () => false);
}

function PickerContent({ children, side }: { children: ReactNode; side?: 'bottom' | 'right' }) {
  return (
    <Popover.Portal>
      <Popover.Content
        side={side}
        align="start"
        sideOffset={6}
        collisionPadding={12}
        // Ao abrir, o foco vai para o dia escolhido (ou hoje), não para o botão "Mês anterior".
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const root = e.currentTarget as HTMLElement;
          root.querySelector<HTMLButtonElement>('[role="grid"] button[tabindex="0"]')?.focus();
        }}
        // Nunca sai do ecrã: num espaço curto (janela a meio do ecrã) fica com scroll por dentro.
        className="z-50 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-xl border border-border-strong bg-surface-2 p-3 shadow-card"
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  );
}

type FieldProps = {
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  min?: string;
  max?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/** Campo de data ("AAAA-MM-DD" ou ''), com calendário. */
export function DateInput({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  className,
  min,
  max,
  disabled,
  ...field
}: FieldProps & { value: string | null | undefined; onChange: (iso: string) => void }) {
  const current = value ?? '';
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatDateText(current));
  const [prev, setPrev] = useState(current);
  // O valor mudou por fora (calendário, "Limpar filtros"…): mostra-o, a não ser que seja o que está escrito.
  if (current !== prev) {
    setPrev(current);
    if (parseDateText(text) !== current) setText(formatDateText(current));
  }

  function type(next: string) {
    setText(next);
    if (!next.trim()) onChange('');
    else {
      const iso = parseWhileTyping(next);
      if (iso) onChange(iso);
    }
  }

  function commit() {
    if (!text.trim()) return;
    const iso = parseDateText(text);
    if (iso && iso !== current) onChange(iso);
    setText(formatDateText(iso ?? current));
  }

  function pick(iso: string) {
    onChange(iso);
    setText(formatDateText(iso));
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span className={cn('relative inline-flex w-full', className)}>
          <input
            {...field}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            readOnly={coarse}
            value={text}
            onChange={(e) => type(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              field.onKeyDown?.(e);
              if (e.key === 'ArrowDown' && e.altKey) {
                e.preventDefault();
                setOpen(true);
              }
            }}
            onClick={() => coarse && !disabled && setOpen(true)}
            className={cn(control, coarse && 'cursor-pointer')}
          />
          <Popover.Trigger
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            className="absolute top-1/2 right-1 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
          </Popover.Trigger>
        </span>
      </Popover.Anchor>
      <PickerContent>
        <Calendar
          value={current}
          onSelect={pick}
          min={min}
          max={max}
          footer={
            <>
              {current ? (
                <button type="button" className={footerButton} onClick={() => pick('')}>
                  Limpar
                </button>
              ) : (
                <span />
              )}
              <button type="button" className={footerButton} onClick={() => pick(todayIso())}>
                Hoje
              </button>
            </>
          }
        />
      </PickerContent>
    </Popover.Root>
  );
}

const QUICK_TIMES = ['09:00', '12:00', '15:00', '18:00'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Horas ou minutos com setas: ▲/▼ (ou as setas do teclado) sobem e descem — as
 * horas de 1 em 1, os minutos de 15 em 15 —, e também se pode escrever o número.
 */
function TimeSegment({
  id,
  label,
  value,
  max,
  step,
  onChange,
}: {
  id?: string;
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(pad2(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(pad2(value));
  }
  const size = max + 1;
  // Os minutos encaixam no quarto de hora seguinte/anterior (07 → 15 ou 00); 45 + 15 volta a 00.
  const bump = (dir: 1 | -1) => {
    const next = step > 1 ? (dir > 0 ? Math.floor(value / step) + 1 : Math.ceil(value / step) - 1) * step : value + dir;
    onChange(((next % size) + size) % size);
  };
  const arrow = 'inline-flex h-9 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg pointer-coarse:h-10 pointer-coarse:w-9';
  return (
    <div className="flex items-center rounded-lg border border-border-input bg-surface">
      <button type="button" className={arrow} onClick={() => bump(-1)} aria-label={`Menos ${label.toLowerCase()}`}>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      <input
        id={id}
        aria-label={label}
        value={text}
        inputMode="numeric"
        maxLength={2}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
          setText(digits);
          if (digits && Number(digits) <= max) onChange(Number(digits));
        }}
        onBlur={() => setText(pad2(value))}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            bump(e.key === 'ArrowUp' ? 1 : -1);
          }
        }}
        className="h-9 w-8 bg-transparent text-center text-base font-medium tabular focus-visible:outline-none"
      />
      <button type="button" className={arrow} onClick={() => bump(1)} aria-label={`Mais ${label.toLowerCase()}`}>
        <ChevronUp className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Campo de data e hora ("AAAA-MM-DDTHH:MM" na hora local, ou ''), com calendário e hora. */
export function DateTimeInput({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa hh:mm',
  className,
  min,
  max,
  disabled,
  ...field
}: FieldProps & { value: string | null | undefined; onChange: (local: string) => void }) {
  const current = value ?? '';
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatDateTimeText(current));
  const [prev, setPrev] = useState(current);
  if (current !== prev) {
    setPrev(current);
    if (parseDateTimeText(text) !== current) setText(formatDateTimeText(current));
  }
  const date = current.slice(0, 10);
  const time = current.slice(11, 16) || '09:00';
  const [timeText, setTimeText] = useState(time);
  const [prevTime, setPrevTime] = useState(time);
  if (time !== prevTime) {
    setPrevTime(time);
    setTimeText(time);
  }

  function set(next: string) {
    onChange(next);
    setText(formatDateTimeText(next));
  }

  function type(next: string) {
    setText(next);
    if (!next.trim()) onChange('');
    else if (/\d{4}/.test(next)) {
      const local = parseDateTimeText(next);
      if (local) onChange(local);
    }
  }

  function commit() {
    if (!text.trim()) return;
    const local = parseDateTimeText(text);
    if (local && local !== current) onChange(local);
    setText(formatDateTimeText(local ?? current));
  }

  const wide = useWideScreen();
  // A hora à vista nas setas: a escrita (se for válida) ou a do valor.
  const shownTime = parseTimeText(timeText) ?? time;

  function setTime(t: string) {
    setTimeText(t);
    const parsed = parseTimeText(t);
    if (parsed) set(`${date || todayIso()}T${parsed}`);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span className={cn('relative inline-flex w-full', className)}>
          <input
            {...field}
            type="text"
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            readOnly={coarse}
            value={text}
            onChange={(e) => type(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              field.onKeyDown?.(e);
              if (e.key === 'ArrowDown' && e.altKey) {
                e.preventDefault();
                setOpen(true);
              }
            }}
            onClick={() => coarse && !disabled && setOpen(true)}
            className={cn(control, coarse && 'cursor-pointer')}
          />
          <Popover.Trigger
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            className="absolute top-1/2 right-1 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
          </Popover.Trigger>
        </span>
      </Popover.Anchor>
      {/* Dia e hora é alto (calendário + horas): no computador abre ao lado, onde cabe inteiro. */}
      <PickerContent side={wide ? 'right' : 'bottom'}>
        <Calendar
          value={date}
          onSelect={(iso) => set(`${iso}T${parseTimeText(timeText) ?? time}`)}
          min={min}
          max={max}
          footer={
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center gap-2" role="group" aria-label="Hora">
                <span className="mr-auto text-sm text-muted">Hora</span>
                <TimeSegment
                  id={`${field.id ?? 'dt'}-time`}
                  label="Horas"
                  value={Number(shownTime.slice(0, 2))}
                  max={23}
                  step={1}
                  onChange={(h) => setTime(`${pad2(h)}:${shownTime.slice(3, 5)}`)}
                />
                <span className="font-medium text-muted">:</span>
                <TimeSegment
                  label="Minutos"
                  value={Number(shownTime.slice(3, 5))}
                  max={59}
                  step={15}
                  onChange={(m) => setTime(`${shownTime.slice(0, 2)}:${pad2(m)}`)}
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Horas habituais">
                {QUICK_TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    aria-pressed={shownTime === t && !!date}
                    className={cn(
                      'h-8 rounded-md border text-xs tabular transition-colors',
                      shownTime === t && date
                        ? 'border-accent/60 bg-accent-soft font-medium text-accent-text'
                        : 'border-border text-muted hover:bg-surface-3 hover:text-fg',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                {current ? (
                  <button
                    type="button"
                    className={footerButton}
                    onClick={() => {
                      set('');
                      setOpen(false);
                    }}
                  >
                    Limpar
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" className={footerButton} onClick={() => setOpen(false)}>
                  OK
                </button>
              </div>
            </div>
          }
        />
      </PickerContent>
    </Popover.Root>
  );
}
