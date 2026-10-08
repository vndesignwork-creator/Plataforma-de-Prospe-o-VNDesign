'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { SignatureUpdateSchema, formatSignature, type Signature } from '@vndesign/core';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useSignature } from '@/lib/queries';

/** No formulário, os projetos são uma caixa de texto (um link por linha). */
const FormSchema = SignatureUpdateSchema.omit({ project_links: true }).extend({ projects: z.string().max(5000) });
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

function toForm(s: Signature | undefined): FormInput {
  return {
    full_name: s?.full_name ?? '',
    role_title: s?.role_title ?? '',
    company: s?.company ?? '',
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    website: s?.website ?? '',
    portfolio_url: s?.portfolio_url ?? '',
    projects: (s?.project_links ?? []).join('\n'),
  };
}

export function SignatureSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useSignature();
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(FormSchema), defaultValues: toForm(data) });
  useEffect(() => reset(toForm(data)), [data, reset]);
  const values = useWatch({ control });

  const onSubmit = handleSubmit(async ({ projects, ...rest }) => {
    try {
      const project_links = projects.split(/\n|,/).map((l) => l.trim()).filter(Boolean);
      const { data: saved } = await api<{ data: Signature }>('/signature', { method: 'PUT', body: { ...rest, project_links } });
      qc.setQueryData(['signature'], saved);
      reset(toForm(saved));
      toast.success('Assinatura guardada.');
    } catch (e) {
      const err = e as { problem?: { errors?: Record<string, string[]> } };
      const linkError = Object.entries(err.problem?.errors ?? {}).find(([k]) => k.startsWith('project_links'));
      if (linkError) setError('projects', { message: 'Há um link de projeto inválido.' });
      toast.error(errorMessage(e));
    }
  });

  if (isLoading) return <Skeleton className="h-64" />;

  const preview = formatSignature({
    full_name: values.full_name ?? '',
    role_title: values.role_title,
    company: values.company,
    phone: values.phone,
    website: values.website,
  });

  return (
    <Card id="assinatura">
      <CardHeader
        title="Assinatura"
        description="Usada nas variáveis {{assinatura}}, {{meu_nome}}, {{meu_telefone}}, {{portfolio}} e {{projetos}}."
      />
      <form onSubmit={onSubmit} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
        <Field label="Nome" error={errors.full_name?.message} required>
          <Input autoComplete="name" {...register('full_name')} />
        </Field>
        <Field label="Cargo" error={errors.role_title?.message}>
          <Input {...register('role_title')} />
        </Field>
        <Field label="Empresa" error={errors.company?.message}>
          <Input {...register('company')} />
        </Field>
        <Field label="Telefone" error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" {...register('phone')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Site" error={errors.website?.message}>
          <Input type="url" {...register('website')} />
        </Field>
        <Field label="Link do portfólio" error={errors.portfolio_url?.message}>
          <Input type="url" {...register('portfolio_url')} />
        </Field>
        <Field label="Projetos (um link por linha)" error={errors.projects?.message}>
          <Textarea rows={4} {...register('projects')} />
        </Field>
        <div className="md:col-span-2">
          <p className="mb-1 text-sm font-medium">Pré-visualização de {'{{assinatura}}'}</p>
          <pre className="rounded-lg bg-surface-2 p-3 font-sans text-sm whitespace-pre-wrap">{preview || '—'}</pre>
        </div>
        <div className="flex justify-end md:col-span-2">
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Guardar assinatura
          </Button>
        </div>
      </form>
    </Card>
  );
}
