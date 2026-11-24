'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_RESET_REPLY } from '@vndesign/core';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { safeNextPath } from '@/lib/utils';

const LoginSchema = z.object({
  email: z.email({ error: 'Indica um email válido.' }),
  password: z.string().min(1, { error: 'Indica a palavra-passe.' }),
});
type LoginValues = z.infer<typeof LoginSchema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(
    params.get('erro') === 'link' ? 'O link expirou ou é inválido. Pede um novo.' : null,
  );
  const [sendingReset, setSendingReset] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (authError) {
      setError(
        authError.message.toLowerCase().includes('invalid')
          ? 'Email ou palavra-passe incorretos.'
          : 'Não foi possível entrar. Tenta novamente.',
      );
      return;
    }
    // Verificação em dois passos ligada: falta o código da app de autenticação.
    const { data: aal } = await getSupabaseBrowserClient().auth.mfa.getAuthenticatorAssuranceLevel();
    const next = safeNextPath(params.get('next'));
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      router.replace(`/verificar?next=${encodeURIComponent(next)}`);
      return;
    }
    router.replace(next);
    router.refresh();
  });

  /** O email sai da própria plataforma (em português), não do serviço de autenticação. */
  async function sendReset() {
    if (!(await trigger('email'))) return;
    setSendingReset(true);
    try {
      const response = await fetch('/api/v1/public/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: getValues('email') }),
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: { message?: string }; error?: { detail?: string; title?: string } }
        | null;
      if (response.ok) toast.success(body?.data?.message ?? PASSWORD_RESET_REPLY);
      else toast.error(body?.error?.detail ?? body?.error?.title ?? 'Não foi possível enviar o email. Tenta mais tarde.');
    } catch {
      toast.error('Não foi possível enviar o email. Tenta mais tarde.');
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6" noValidate>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Field label="Email" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" autoFocus {...register('email')} />
      </Field>
      <Field label="Palavra-passe" error={errors.password?.message} required>
        <PasswordInput autoComplete="current-password" {...register('password')} />
      </Field>
      <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
        Entrar
      </Button>
      <button
        type="button"
        onClick={sendReset}
        disabled={sendingReset}
        className="text-sm text-muted hover:text-fg"
      >
        Esqueci-me da palavra-passe
      </button>
    </form>
  );
}
