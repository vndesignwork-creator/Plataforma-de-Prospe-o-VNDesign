'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { SignatureUpdateSchema, formatSignature, type Signature } from '@vndesign/core';
import { useEffect, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormSaveBar } from '@/components/ui/form-save-bar';
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
    design_portfolio_url: s?.design_portfolio_url ?? '',
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
      <CardHeader title="Assinatura" description="Aparece no fim dos emails e preenche as variáveis dos modelos (ex.: {{assinatura}})." />
      <form onSubmit={onSubmit} className="p-4" noValidate>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex flex-col gap-6">
            <Group title="Sobre ti">
              <Field label="Nome" hint="{{meu_nome}}" error={errors.full_name?.message} required>
                <Input autoComplete="name" placeholder="Ana Silva" {...register('full_name')} />
              </Field>
              <Field label="Cargo" error={errors.role_title?.message}>
                <Input placeholder="Web Designer" {...register('role_title')} />
              </Field>
              <Field label="Telefone" hint="{{meu_telefone}}" error={errors.phone?.message}>
                <Input type="tel" autoComplete="tel" placeholder="+351 912 345 678" {...register('phone')} />
              </Field>
              <Field label="Email" error={errors.email?.message}>
                <Input type="email" autoComplete="email" placeholder="ola@empresa.pt" {...register('email')} />
              </Field>
            </Group>
            <Group title="Empresa">
              <Field label="Empresa" error={errors.company?.message}>
                <Input placeholder="VNDesign" {...register('company')} />
              </Field>
              <Field label="Site" error={errors.website?.message}>
                <Input type="url" placeholder="https://empresa.pt" {...register('website')} />
              </Field>
            </Group>
            <Group title="Portefólio">
              <Field label="Link do portfólio" hint="{{portfolio}}" error={errors.portfolio_url?.message}>
                <Input type="url" placeholder="https://empresa.pt/portfolio" {...register('portfolio_url')} />
              </Field>
              <Field
                label="Portfólio de design gráfico"
                hint="{{portfolio_design}} · nos emails sobre logótipos, flyers e posts."
                error={errors.design_portfolio_url?.message}
              >
                <Input type="url" placeholder="https://behance.net/…" {...register('design_portfolio_url')} />
              </Field>
              <Field label="Projetos (um link por linha)" hint="{{projetos}}" error={errors.projects?.message} className="md:col-span-2">
                <Textarea rows={4} placeholder={'https://cliente-um.pt\nhttps://cliente-dois.pt'} {...register('projects')} />
              </Field>
            </Group>
          </div>
          <aside aria-label="Pré-visualização da assinatura" className="self-start lg:sticky lg:top-6">
            <p className="mb-1.5 text-sm font-medium">Pré-visualização</p>
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <p className="text-muted">Cumprimentos,</p>
              <pre className="mt-2 font-sans whitespace-pre-wrap">{preview || '—'}</pre>
            </div>
            <p className="mt-1.5 text-xs text-muted">É o que entra em {'{{assinatura}}'} no fim dos emails.</p>
          </aside>
        </div>
        <FormSaveBar dirty={isDirty} saving={isSubmitting} onDiscard={() => reset(toForm(data))} disableWhenClean className="mt-6">
          Guardar assinatura
        </FormSaveBar>
      </form>
    </Card>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 md:grid-cols-2">
      <legend className="mb-3 text-xs font-medium tracking-wide text-muted uppercase md:col-span-2">{title}</legend>
      {children}
    </fieldset>
  );
}
