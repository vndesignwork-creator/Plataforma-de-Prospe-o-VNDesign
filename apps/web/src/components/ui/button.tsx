import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover font-semibold',
  secondary: 'bg-surface-3 text-fg hover:bg-border-strong',
  outline: 'border border-border-strong bg-transparent text-fg hover:bg-surface-2',
  // Laranja suave: para ações que se repetem em muitas linhas (o laranja cheio cansa a vista).
  soft: 'bg-accent-soft text-accent-text hover:bg-accent-soft/70 font-medium',
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

/**
 * O nome de um botão só com ícone, num balão por baixo ao passar o rato (ou com o teclado).
 * O botão precisa das classes "group relative" e do aria-label (o balão não é lido duas vezes).
 */
export function HoverHint({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md border border-border bg-surface-3 px-2 py-1 text-xs font-medium whitespace-nowrap text-fg opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:hidden"
    >
      {children}
    </span>
  );
}
