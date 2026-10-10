'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  LEAD_CHANNEL_META,
  LEAD_CHANNELS,
  LEAD_STATUS_META,
  LEAD_STATUSES,
  LeadCreateSchema,
  isDirectoryUrl,
  isSocialUrl,
  parseEuroAmount,
  MOBILE_STATUS_META,
  MOBILE_STATUSES,
  type DuplicateMatch,
  type Lead,
  type LeadCreate,
  type LeadCreateInput,
} from '@vndesign/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { checkDuplicates, useInvalidateLead, useSectors } from '@/lib/queries';
import { DuplicatePanel } from './duplicate-panel';
import { MERGE_DRAFT_KEY } from './merge-view';
import { ServicePicker } from '@/components/services/services';

type FormInput = LeadCreateInput;

const TEXT_FIELDS = [
  'company_name', 'website', 'city', 'address', 'problems', 'email', 'phone', 'contact_name',
  'first_contact_on', 'last_follow_up_on', 'next_action_text', 'next_action_on', 'notes',
  'approach_angle', 'source_url', 'suggested_on', 'email_subject', 'email_body',
] as const;

/** Valores iniciais do formulário (null → '' nos campos de texto). */
function toFormValues(lead?: Lead): FormInput {
  const values: Record<string, unknown> = {
    sector_id: lead?.sector_id ?? null,
    pagespeed: lead?.pagespeed ?? null,
    estimated_value: lead?.estimated_value ?? null,
    mobile: lead?.mobile ?? 'desconhecido',
    status: lead?.status ?? 'identificado',
    channel: lead?.channel ?? null,
    services: lead?.services ?? [],
  };
  for (const f of TEXT_FIELDS) values[f] = (lead?.[f] as string | null | undefined) ?? '';
  return values as FormInput;
}

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v);
// Valores à portuguesa: "1.200", "1.200,50", "950 €".
const toNumber = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return null;
  return parseEuroAmount(v) ?? Number.NaN;
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">{children}</div>
    </Card>
  );
}

export function LeadForm({ lead }: { lead?: Lead }) {
  const router = useRouter();
  const isEdit = Boolean(lead);
  const invalidate = useInvalidateLead();
  const { data: sectors } = useSectors();
  const [conflicts, setConflicts] = useState<DuplicateMatch[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormInput, unknown, LeadCreate>({
    resolver: zodResolver(LeadCreateSchema),
    defaultValues: toFormValues(lead),
  });

  // Verificação de duplicados enquanto se escreve (nome, website, email).
  const [name, website, email] = useWatch({ control, name: ['company_name', 'website', 'email'] });
  const probe = useDebouncedValue({ name: name?.trim() ?? '', website: website?.trim() ?? '', email: email?.trim() ?? '' }, 500);
  const shouldCheck = probe.name.length >= 3 || probe.website.length >= 4 || probe.email.includes('@');
  const dupCheck = useQuery({
    queryKey: ['duplicate-check', probe, lead?.id ?? null],
    queryFn: ({ signal }) =>
      checkDuplicates(
        { company_name: probe.name, website: probe.website || null, email: probe.email || null, exclude_id: lead?.id ?? null },
        signal,
      ),
    enabled: shouldCheck,
    staleTime: 30_000,
  });

  function goMerge(match: DuplicateMatch) {
    if (lead) {
      // Edição: junta o outro lead a este (este fica como principal).
      router.push(`/leads/${lead.id}/juntar?com=${match.lead_id}`);
    } else {
      // Criação: leva os dados escritos para juntar ao lead existente.
      sessionStorage.setItem(MERGE_DRAFT_KEY, JSON.stringify(getValues()));
      router.push(`/leads/${match.lead_id}/juntar?rascunho=1`);
    }
  }

  async function save(values: LeadCreate, force = false) {
    setFormError(null);
    try {
      const result = isEdit
        ? await api<{ data: Lead }>(`/leads/${lead!.id}`, { method: 'PATCH', body: values })
        : await api<{ data: Lead }>('/leads', { method: 'POST', body: values, query: { force: force || undefined } });
      invalidate(result.data.id);
      toast.success(isEdit ? 'Lead atualizado.' : `Lead #${result.data.number} criado.`);
      router.push(`/leads/${result.data.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 409 && Array.isArray(error.problem.duplicates)) {
          setConflicts(error.problem.duplicates as DuplicateMatch[]);
          return;
        }
        if (error.status === 400 && error.problem.errors) {
          for (const [field, messages] of Object.entries(error.problem.errors)) {
            setError(field as FieldPath<FormInput>, { message: messages[0] });
          }
        }
      }
      setFormError(errorMessage(error));
    }
  }

  const onSubmit = handleSubmit((values) => save(values));
  const e = (f: keyof FormInput) => errors[f]?.message as string | undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pb-24">
      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Section title="Empresa" description="Só dados empresariais públicos (RGPD).">
        <Field label="Empresa" error={e('company_name')} required className="md:col-span-2">
          <Input autoComplete="off" autoFocus={!isEdit} {...register('company_name')} />
        </Field>
        {dupCheck.data && (dupCheck.data.duplicates.length || dupCheck.data.do_not_contact.length) ? (
          <div className="md:col-span-2">
            <DuplicatePanel
              duplicates={dupCheck.data.duplicates}
              doNotContact={dupCheck.data.do_not_contact}
              onMerge={goMerge}
              mergeLabel={isEdit ? 'Juntar a este' : 'Juntar com este'}
            />
          </div>
        ) : null}
        <Field label="Setor" error={e('sector_id')}>
          <Select {...register('sector_id', { setValueAs: emptyToNull })}>
            <option value="">— Sem setor —</option>
            {(sectors ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cidade" error={e('city')}>
          <Input autoComplete="off" {...register('city')} />
        </Field>
        <Field
          label="Website"
          error={e('website')}
          hint={
            isDirectoryUrl(website)
              ? 'Isto é um diretório (TripAdvisor, Sluurpy, Google Maps…), não o site da empresa: ao gravar passa para “Fonte”.'
              : isSocialUrl(website)
                ? 'Rede social: fica como página da empresa (sem site próprio).'
                : 'O site próprio da empresa (ex.: vndesign.pt). Sem site? Deixa vazio ou põe a página de Facebook.'
          }
        >
          <Input type="url" inputMode="url" autoComplete="off" {...register('website')} />
        </Field>
        <Field label="Morada" error={e('address')} hint="Morada comercial (para o mapa, mais tarde)">
          <Input autoComplete="off" {...register('address')} />
        </Field>
        <Field label="Fonte (origem dos dados)" error={e('source_url')} hint="URL onde encontraste a empresa">
          <Input type="url" inputMode="url" autoComplete="off" {...register('source_url')} />
        </Field>
        <Field label="Sugerido em" error={e('suggested_on')}>
          <Input type="date" {...register('suggested_on')} />
        </Field>
      </Section>

      <Section title="Serviços de interesse" description="O que podes propor a esta empresa — site, imagem gráfica ou ambos.">
        <div className="md:col-span-2">
          <Controller
            control={control}
            name="services"
            render={({ field }) => <ServicePicker value={field.value ?? []} onChange={field.onChange} />}
          />
        </div>
      </Section>

      <Section title="Contacto">
        <Field label="Pessoa de contacto" error={e('contact_name')}>
          <Input autoComplete="off" {...register('contact_name')} />
        </Field>
        <Field label="Email" error={e('email')}>
          <Input type="email" inputMode="email" autoComplete="off" {...register('email')} />
        </Field>
        <Field label="Telefone" error={e('phone')}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...register('phone')} />
        </Field>
        <Field label="Canal" error={e('channel')}>
          <Select {...register('channel', { setValueAs: emptyToNull })}>
            <option value="">—</option>
            {LEAD_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {LEAD_CHANNEL_META[c].label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Diagnóstico do site">
        <Field label="Problemas" error={e('problems')} className="md:col-span-2">
          <Textarea rows={3} {...register('problems')} />
        </Field>
        <Field label="PageSpeed (0–100)" error={e('pagespeed')} hint="Mobile, do PageSpeed Insights">
          <Input type="number" inputMode="numeric" min={0} max={100} step={1} {...register('pagespeed', { setValueAs: toNumber })} />
        </Field>
        <Field label="Mobile?" error={e('mobile')}>
          <Select {...register('mobile')}>
            {MOBILE_STATUSES.map((m) => (
              <option key={m} value={m}>
                {m === 'desconhecido' ? '-- (por verificar)' : MOBILE_STATUS_META[m].label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Pipeline" description='Ao passar a "Contactado", é agendado um follow-up a +3 dias.'>
        <Field label="Estado" error={e('status')}>
          <Select {...register('status')}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor estimado (€)" error={e('estimated_value')}>
          <Input inputMode="decimal" placeholder="0,00" {...register('estimated_value', { setValueAs: toNumber })} />
        </Field>
        <Field label="1.º contacto" error={e('first_contact_on')}>
          <Input type="date" {...register('first_contact_on')} />
        </Field>
        <Field label="Último follow-up" error={e('last_follow_up_on')}>
          <Input type="date" {...register('last_follow_up_on')} />
        </Field>
        <Field label="Próxima ação" error={e('next_action_text')}>
          <Input placeholder="Ex.: Ligar a perguntar pelo email" {...register('next_action_text')} />
        </Field>
        <Field label="Data da próxima ação" error={e('next_action_on')}>
          <Input type="date" {...register('next_action_on')} />
        </Field>
      </Section>

      <Section title="Abordagem e email de prospeção">
        <Field label="Ângulo de abordagem" error={e('approach_angle')} className="md:col-span-2">
          <Textarea rows={2} {...register('approach_angle')} />
        </Field>
        <Field label="Assunto do email" error={e('email_subject')} className="md:col-span-2">
          <Input {...register('email_subject')} />
        </Field>
        <Field label="Email de prospeção" error={e('email_body')} className="md:col-span-2">
          <Textarea rows={10} className="font-mono text-[13px]" {...register('email_body')} />
        </Field>
      </Section>

      <Section title="Notas">
        <Field label="Notas" error={e('notes')} className="md:col-span-2">
          <Textarea rows={4} {...register('notes')} />
        </Field>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
          {isEdit && isDirty ? <span className="mr-auto text-sm text-muted">Alterações por gravar</span> : null}
          <Link href={lead ? `/leads/${lead.id}` : '/leads'} className={buttonClasses('ghost')}>
            Cancelar
          </Link>
          <Button type="submit" loading={isSubmitting}>
            {isEdit ? 'Gravar alterações' : 'Criar lead'}
          </Button>
        </div>
      </div>

      <Dialog
        open={conflicts !== null}
        onOpenChange={(open) => !open && setConflicts(null)}
        title="Este lead pode já existir"
        description="Encontrámos leads parecidos. Podes juntar os dados a um deles ou criar mesmo assim."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConflicts(null)}>
              Voltar
            </Button>
            <Button
              variant="outline"
              loading={isSubmitting}
              onClick={handleSubmit(async (values) => {
                setConflicts(null);
                await save(values, true);
              })}
            >
              Criar mesmo assim
            </Button>
          </>
        }
      >
        <DuplicatePanel duplicates={conflicts ?? []} doNotContact={[]} onMerge={goMerge} mergeLabel="Juntar com este" />
      </Dialog>
    </form>
  );
}
