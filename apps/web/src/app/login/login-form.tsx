'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

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
    const next = params.get('next');
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    router.refresh();
  });

  async function sendReset() {
    if (!(await trigger('email'))) return;
    setSendingReset(true);
    const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(getValues('email'), {
      redirectTo: `${window.location.origin}/auth/callback?next=/definicoes%23conta`,
    });
    setSendingReset(false);
    if (resetError) toast.error('Não foi possível enviar o email. Tenta mais tarde.');
    else toast.success('Se o email existir, vais receber um link para definir nova palavra-passe.');
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
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
        Entrar
      </Button>
      <button
        type="button"
        onClick={sendReset}
        disabled={sendingReset}
        className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        Esqueci-me da palavra-passe
      </button>
    </form>
  );
}
