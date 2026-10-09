'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DropdownRoot = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ children, className, align = 'end' }: { children: ReactNode; className?: string; align?: 'start' | 'end' }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
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
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Menu.Item onSelect={onSelect} disabled={disabled} className={cn(itemClass, danger && 'text-danger data-[highlighted]:bg-danger-soft')}>
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

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{children}</Menu.Label>;
}

export function DropdownSeparator() {
  return <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border-strong" />;
}
