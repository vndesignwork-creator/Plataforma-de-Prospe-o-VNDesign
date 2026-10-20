'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

/** Campo de palavra-passe (ou chave) com o botão do olho para mostrar/esconder o texto. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function PasswordInput({ className, id, ...props }, ref) {
    const [shown, setShown] = useState(false);
    const fallbackId = useId();
    const inputId = id ?? fallbackId;
    return (
      <div className="relative">
        <Input ref={ref} id={inputId} type={shown ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-controls={inputId}
          aria-pressed={shown}
          aria-label={shown ? 'Esconder' : 'Mostrar'}
          title={shown ? 'Esconder' : 'Mostrar'}
          disabled={props.disabled}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:opacity-60"
        >
          {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    );
  },
);
