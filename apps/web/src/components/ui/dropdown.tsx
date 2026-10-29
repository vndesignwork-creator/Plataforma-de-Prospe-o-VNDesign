'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { createContext, useContext, useRef, useState, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { cn } from '@/lib/utils';

const SetOpen = createContext<Dispatch<SetStateAction<boolean>> | null>(null);

export function DropdownRoot({
  open: controlledOpen,
  onOpenChange,
  ...props
}: Omit<ComponentProps<typeof Menu.Root>, 'onOpenChange'> & { onOpenChange?: Dispatch<SetStateAction<boolean>> }) {
  const [ownOpen, setOwnOpen] = useState(false);
  // Controlado (open/onOpenChange) ou, por omissão, com estado próprio.
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  return (
    <SetOpen.Provider value={setOpen}>
      <Menu.Root {...props} open={open} onOpenChange={setOpen} />
    </SetOpen.Provider>
  );
}

/**
 * O Radix abre o menu logo ao pousar o dedo (pointerdown): no telemóvel, um
 * deslize para fazer scroll que comece em cima do botão abria o menu e travava o
 * scroll. Com o dedo/caneta só abre no toque completo (click); com o rato e o
 * teclado fica igual.
 */
export function DropdownTrigger({ onPointerDown, onClick, ...props }: ComponentProps<typeof Menu.Trigger>) {
  const setOpen = useContext(SetOpen);
  const touch = useRef(false);
  return (
    <Menu.Trigger
      {...props}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        touch.current = e.pointerType !== 'mouse';
        if (touch.current && setOpen) e.preventDefault(); // o Radix ignora eventos já "prevenidos"
      }}
      onClick={(e) => {
        onClick?.(e);
        if (touch.current && setOpen && !e.defaultPrevented) setOpen((o) => !o);
        touch.current = false;
      }}
    />
  );
}

export function DropdownContent({
  children,
  className,
  align = 'end',
  onCloseAutoFocus,
}: {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end';
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        onCloseAutoFocus={onCloseAutoFocus}
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          // Fundo e borda mais claros que os cartões, para o menu não se confundir com o que está por baixo.
          'z-50 max-h-[70dvh] max-w-[calc(100vw-1.5rem)] min-w-56 overflow-y-auto rounded-xl border border-border-strong bg-surface-2 p-1.5 shadow-card',
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

const itemClass =
  'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-surface-3 data-[disabled]:cursor-default data-[disabled]:opacity-50 [&>svg]:shrink-0';

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  /** event.preventDefault() mantém o menu aberto. */
  onSelect?: (event: Event) => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(itemClass, danger && 'text-danger data-[highlighted]:bg-danger-soft', className)}
    >
      {children}
    </Menu.Item>
  );
}

export function DropdownCheckboxItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(e) => e.preventDefault()}
      className={cn(itemClass, 'pl-7 relative')}
    >
      <Menu.ItemIndicator className="absolute left-2 inline-flex">
        <Check className="h-4 w-4 text-accent-text" aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

/** Escolha única (um dos itens marcado com um ponto). */
export function DropdownRadioGroup({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) {
  return (
    <Menu.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </Menu.RadioGroup>
  );
}

export function DropdownRadioItem({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) {
  return (
    <Menu.RadioItem value={value} disabled={disabled} className={cn(itemClass, 'relative pl-7')}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex">
        <Check className="h-4 w-4 text-accent-text" aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{children}</Menu.Label>;
}

export function DropdownSeparator() {
  return <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border-strong" />;
}
