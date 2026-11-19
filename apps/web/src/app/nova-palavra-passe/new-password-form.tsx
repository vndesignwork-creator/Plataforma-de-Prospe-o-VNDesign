'use client';

/**
 * Definir a nova palavra-passe depois de carregar no link do email. Só funciona
 * com a sessão de recuperação aberta (o link já foi trocado por sessão em
 * /auth/callback); sem ela, manda pedir um link novo.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH } from '@vndesign/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

const Schema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.` })
      .max(72, { error: 'No máximo 72 caracteres.' }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], error: 'As palavras-passe não são iguais.' });
type Values = z.infer<typeof Schema>;

export function NewPasswordForm() {
  const router = useRouter();
  // null = ainda a verificar; false = sem sessão (link gasto ou expirado).
  const [ready, setReady] = useState<boolean | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(Schema) });

  useEffect(() => {
    let alive = true;
    void getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) setReady(!!data.user);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = handleSubmit(async ({ password }) => {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      toast.error(
        /weak|short|length/i.test(error.message)
          ? 'Palavra-passe demasiado fraca. Escolhe outra (letras e números).'
          : 'Não foi possível guardar. Pede um link novo e tenta outra vez.',
      );
      return;
    }
    toast.success('Palavra-passe alterada. Já estás dentro.');
    router.replace('/dashboard');
    router.refresh();
  });

  if (ready === null) {
    return <p className="text-center text-sm text-muted">A verificar o link…</p>;
  }
  if (!ready) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6 text-sm">
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          O link expirou ou já foi usado. Os links servem durante uma hora e só uma vez.
        </p>
        <Link href="/login" className="text-center text-muted underline-offset-4 hover:text-fg hover:underline">
          Pedir um link novo
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6" noValidate>
      <Field label="Nova palavra-passe" error={errors.password?.message} hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`} required>
        <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
      </Field>
      <Field label="Repetir a palavra-passe" error={errors.confirm?.message} required>
        <PasswordInput autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
        Guardar e entrar
      </Button>
    </form>
  );
}
