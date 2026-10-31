'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  SIGNATURE_LOGO_MAX_BYTES,
  SIGNATURE_LOGO_SIZES,
  SIGNATURE_LOGO_STORE_WIDTH,
  SignatureUpdateSchema,
  formatSignature,
  type Signature,
} from '@vndesign/core';
import { ImagePlus, Trash2, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormSaveBar } from '@/components/ui/form-save-bar';
import { Input, Textarea } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { imageFileFromUrl } from '@/lib/image-file';
import { useMe, useSignature } from '@/lib/queries';

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
    logo_width: s?.logo_width ?? 160,
  };
}

/**
 * Prepara o logótipo no browser: qualquer imagem (incluindo SVG e WebP, que muitos
 * programas de email não mostram) passa a PNG, com no máximo 640 px de largura
 * (o dobro do tamanho maior, para ficar nítido). Se o PNG passar de 1 MB, vai em JPEG.
 */
async function prepareLogo(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      el.src = url;
    });
    const naturalWidth = img.naturalWidth || 600;
    const naturalHeight = img.naturalHeight || 200;
    const width = Math.min(SIGNATURE_LOGO_STORE_WIDTH, naturalWidth);
    const height = Math.max(1, Math.round((naturalHeight / naturalWidth) * width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível ler a imagem.');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    const png = await blob('image/png');
    if (png && png.size <= SIGNATURE_LOGO_MAX_BYTES) return png;
    // Muito pesado (ex.: uma fotografia): JPEG sobre fundo branco.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const jpeg = await blob('image/jpeg');
    if (!jpeg || jpeg.size > SIGNATURE_LOGO_MAX_BYTES) throw new Error('A imagem é demasiado grande: escolhe uma com menos de 1 MB.');
    return jpeg;
  } finally {
    URL.revokeObjectURL(url);
  }
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
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(FormSchema), defaultValues: toForm(data) });
  useEffect(() => reset(toForm(data)), [data, reset]);
  const values = useWatch({ control });
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: me } = useMe();
  const avatarUrl = me?.profile?.avatar_url ?? null;

  /** O logótipo passa a ser a foto do perfil. */
  async function applyProfilePhoto() {
    if (!avatarUrl) return;
    setUploading(true);
    try {
      await uploadLogo(await imageFileFromUrl(avatarUrl, 'foto.png'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : errorMessage(error));
      setUploading(false);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Escolhe uma imagem (PNG, JPEG, SVG ou WebP).');
      return;
    }
    setUploading(true);
    try {
      const blob = await prepareLogo(file);
      const form = new FormData();
      form.append('file', new File([blob], blob.type === 'image/png' ? 'logotipo.png' : 'logotipo.jpg', { type: blob.type }));
      const res = await fetch('/api/v1/signature/logo', { method: 'POST', body: form, credentials: 'same-origin' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, payload ?? { type: 'about:blank', title: 'Falha no envio', status: res.status });
      qc.setQueryData(['signature'], (payload as { data: Signature }).data);
      toast.success('Logótipo guardado.');
    } catch (error) {
      toast.error(error instanceof Error && !(error instanceof ApiClientError) ? error.message : errorMessage(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removeLogo() {
    try {
      const { data: saved } = await api<{ data: Signature }>('/signature/logo', { method: 'DELETE' });
      qc.setQueryData(['signature'], saved);
      toast.success('Logótipo tirado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

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
            <Group title="Logótipo">
              <div className="flex flex-col gap-3 md:col-span-2">
                <p className="text-sm text-muted">
                  Vai por baixo da assinatura nos emails que envias pela plataforma (embutido no email, com link para o teu site). PNG com fundo
                  transparente fica melhor; também aceita JPEG, SVG e WebP.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                    className="sr-only"
                    // O botão ao lado abre-o: fora do Tab para não haver dois "Escolher logótipo".
                    tabIndex={-1}
                    aria-label="Escolher logótipo"
                    onChange={(e) => void uploadLogo(e.target.files?.[0])}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} loading={uploading}>
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden /> {data?.logo_url ? 'Mudar logótipo' : 'Escolher logótipo'}
                  </Button>
                  {avatarUrl ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void applyProfilePhoto()} disabled={uploading}>
                      <UserRound className="h-3.5 w-3.5" aria-hidden /> Usar a foto do perfil
                    </Button>
                  ) : null}
                  {data?.logo_url ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void removeLogo()}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Tirar logótipo
                    </Button>
                  ) : null}
                </div>
                {data?.logo_url ? (
                  <div role="radiogroup" aria-label="Tamanho do logótipo" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted">Tamanho:</span>
                    {SIGNATURE_LOGO_SIZES.map((size) => (
                      <label key={size.width} className="inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="radio"
                          name="logo_width"
                          value={size.width}
                          checked={Number(values.logo_width) === size.width}
                          onChange={() => setValue('logo_width', size.width, { shouldDirty: true })}
                          className="accent-[var(--accent)]"
                        />
                        {size.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </Group>
          </div>
          <aside aria-label="Pré-visualização da assinatura" className="self-start lg:sticky lg:top-6">
            <p className="mb-1.5 text-sm font-medium">Pré-visualização</p>
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <p className="text-muted">Cumprimentos,</p>
              <pre className="mt-2 font-sans whitespace-pre-wrap">{preview || '—'}</pre>
              {data?.logo_url ? (
                // Pré-visualização: o tamanho é o do email (fundo branco, como na maioria dos programas de email).
                <span className="mt-3 inline-block max-w-full rounded bg-white p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento */}
                  <img src={data.logo_url} alt="Logótipo da assinatura" style={{ width: Number(values.logo_width) || 160 }} className="block h-auto max-w-full" />
                </span>
              ) : null}
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
