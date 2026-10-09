import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover font-semibold',
  secondary: 'bg-surface-3 text-fg hover:bg-border-strong',
  outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-2',
  ghost: 'bg-transparent text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 font-semibold dark:text-[#0d0d0d]',
};
// Em ecrãs tácteis (pointer-coarse) os botões pequenos crescem para ≥ 40 px, para acertar com o dedo.
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1 text-sm gap-1.5 pointer-coarse:min-h-10',
  md: 'min-h-10 px-4 py-1.5 text-sm gap-2',
  icon: 'h-9 w-9 justify-center pointer-coarse:h-10 pointer-coarse:w-10',
};

/** Classes de botão (também para <Link> com aspeto de botão). */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    // max-w-full: num ecrã estreito, um texto comprido passa para 2 linhas em vez de sair do cartão.
    'inline-flex max-w-full shrink-0 items-center justify-center rounded-lg text-center transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}
