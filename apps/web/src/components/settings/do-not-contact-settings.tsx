'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { DoNotContactCreateSchema, formatDate } from '@vndesign/core';
import { Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { qk, useDoNotContact } from '@/lib/queries';

type Input_ = z.input<typeof DoNotContactCreateSchema>;
type Output = z.output<typeof DoNotContactCreateSchema>;

export function DoNotContactSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useDoNotContact();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input_, unknown, Output>({
    resolver: zodResolver(DoNotContactCreateSchema),
    defaultValues: { company_name: '', website: '', email: '', reason: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/do-not-contact', { method: 'POST', body: values });
      void qc.invalidateQueries({ queryKey: qk.dnc });
      reset();
      toast.success('Acrescentado à lista "não contactar".');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  async function remove(id: string) {
    try {
      await api(`/do-not-contact/${id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: qk.dnc });
      toast.success('Removido da lista.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card id="nao-contactar">
      <CardHeader
        title="Lista “não contactar”"
        description="RGPD: empresas que pediram para não ser contactadas. Bloqueia a criação e a importação (por nome, website ou email)."
      />
      <form onSubmit={onSubmit} className="grid gap-3 border-b border-border p-4 md:grid-cols-2" noValidate>
        <Field label="Empresa" error={errors.company_name?.message} required>
          <Input {...register('company_name')} />
        </Field>
        <Field label="Motivo" error={errors.reason?.message}>
          <Input placeholder="Ex.: pediu por email a 08/10/2026" {...register('reason')} />
        </Field>
        <Field label="Website" error={errors.website?.message}>
          <Input {...register('website')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" size="sm" loading={isSubmitting}>
            Acrescentar à lista
          </Button>
        </div>
      </form>
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-16" />
        </div>
      ) : data?.length ? (
        <ul className="divide-y divide-border">
          {data.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{d.company_name}</p>
                <p className="text-muted">
                  {[d.website, d.email, d.reason, `desde ${formatDate(d.created_at)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Remover ${d.company_name} da lista`} onClick={() => remove(d.id)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-muted">A lista está vazia.</p>
      )}
    </Card>
  );
}
