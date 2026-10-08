'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useTheme } from '@/components/layout/theme';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useMe } from '@/lib/queries';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

const PasswordSchema = z
  .object({
    password: z.string().min(8, { error: 'Mínimo de 8 caracteres.' }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: 'As palavras-passe não coincidem.', path: ['confirm'] });

export function AccountSettings() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof PasswordSchema>>({ resolver: zodResolver(PasswordSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      toast.error('Não foi possível alterar a palavra-passe. Tenta novamente.');
      return;
    }
    reset({ password: '', confirm: '' });
    toast.success('Palavra-passe alterada.');
  });

  return (
    <Card id="conta">
      <CardHeader title="Conta" description={me ? `${me.user.email} · workspace ${me.workspace.name}` : undefined} />
      <div className="grid gap-6 p-4 md:grid-cols-2">
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <h3 className="text-sm font-semibold">Alterar palavra-passe</h3>
          <Field label="Nova palavra-passe" error={errors.password?.message}>
            <Input type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirmar" error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...register('confirm')} />
          </Field>
          <div>
            <Button type="submit" size="sm" loading={isSubmitting}>
              Alterar palavra-passe
            </Button>
          </div>
        </form>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Aparência</h3>
          <Field label="Tema">
            <Select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
              <option value="dark">Escuro (VNDesign)</option>
              <option value="light">Claro</option>
            </Select>
          </Field>
        </div>
      </div>
    </Card>
  );
}
