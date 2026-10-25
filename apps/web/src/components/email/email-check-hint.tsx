'use client';

/** Aviso por baixo de um campo de email: o domínio não existe ou não recebe emails (verificado no servidor). */
import { emailCheckWarning, type EmailCheck } from '@vndesign/core';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function EmailCheckHint({ email }: { email: string | null | undefined }) {
  const value = useDebouncedValue((email ?? '').trim().toLowerCase(), 600);
  const { data } = useQuery({
    queryKey: ['email-check', value],
    queryFn: () => api<{ data: EmailCheck }>('/email-check', { query: { email: value } }).then((r) => r.data),
    enabled: LOOKS_LIKE_EMAIL.test(value),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const warning = LOOKS_LIKE_EMAIL.test(value) ? emailCheckWarning(data) : null;
  if (!warning) return null;
  return (
    <p role="status" className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warning">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {warning}
    </p>
  );
}
