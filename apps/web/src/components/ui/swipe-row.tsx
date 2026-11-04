'use client';

/**
 * Linha de uma lista que se desliza com o dedo (só no ecrã tátil): para a direita
 * faz a ação principal (ex.: Feito), para a esquerda a secundária (ex.: Adiar).
 * Os botões da linha continuam lá: deslizar é só um atalho. Com rato não muda nada.
 */
import { AlarmClock, Check } from 'lucide-react';
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A partir daqui (px) a ação acontece ao largar. */
const TRIGGER = 88;
const MAX = 140;

export function SwipeRow({
  onRight,
  onLeft,
  rightLabel = 'Feito',
  leftLabel = 'Adiar',
  disabled,
  className,
  children,
}: {
  onRight?: () => void;
  onLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
  /** Classes do conteúdo da linha (o que antes estava no <li>). */
  className?: string;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null } | null>(null);
  // Depois de deslizar, o "clique" que o browser envia ao largar não abre o link da linha.
  const swiped = useRef(false);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  function down(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.pointerType !== 'touch') return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null };
    swiped.current = false;
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) {
        s.axis = 'x';
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (Math.abs(my) > 10) {
        // A deslizar para cima/baixo: é a página a andar.
        start.current = null;
        return;
      } else return;
    }
    const allowed = (mx > 0 && onRight) || (mx < 0 && onLeft) ? mx : mx / 4;
    setDx(Math.max(-MAX, Math.min(MAX, allowed)));
  }

  function up() {
    const s = start.current;
    if (s?.axis === 'x') {
      swiped.current = true;
      if (dx >= TRIGGER && onRight) onRight();
      else if (dx <= -TRIGGER && onLeft) onLeft();
    }
    reset();
  }

  const armed = Math.abs(dx) >= TRIGGER;
  return (
    <li className="relative overflow-hidden">
      {dx !== 0 ? (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center px-4 text-sm font-semibold',
            dx > 0 ? 'justify-start bg-success/15 text-success' : 'justify-end bg-warning/15 text-warning',
            armed && (dx > 0 ? 'bg-success/30' : 'bg-warning/30'),
          )}
        >
          {dx > 0 ? (
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" /> {rightLabel}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              {leftLabel} <AlarmClock className="h-4 w-4" />
            </span>
          )}
        </div>
      ) : null}
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (!swiped.current) return;
          swiped.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        className={cn('relative touch-pan-y bg-surface', !dragging && 'transition-transform duration-200', className)}
      >
        {children}
      </div>
    </li>
  );
}
