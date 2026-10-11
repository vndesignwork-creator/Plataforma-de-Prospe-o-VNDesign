import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-border-input bg-surface-2 px-3 text-sm text-fg placeholder:text-muted ' +
  'transition-colors hover:border-muted focus-visible:border-accent focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, 'py-2 leading-relaxed', className)} {...props} />;
  },
);

export { Select } from './select';
