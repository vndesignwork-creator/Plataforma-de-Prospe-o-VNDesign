'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  ContactTemplateCreateSchema,
  TEMPLATE_KIND_LABELS,
  TEMPLATE_KINDS,
  TEMPLATE_VARIABLES,
  renderTemplate,
  type ContactTemplate,
  type ContactTemplateCreateInput,
  type TemplateKind,
} from '@vndesign/core';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useLeads, useSectors, useTemplates } from '@/lib/queries';
import { EMAIL_KINDS, useTemplateContext } from '@/lib/template-context';
import { cn } from '@/lib/utils';
import { SectorIconView } from '@/components/icons/lead-icons';

type FormOutput = z.output<typeof ContactTemplateCreateSchema>;

const EMPTY: ContactTemplateCreateInput = { kind: 'cold_email', name: '', subject: '', body: '', sector_id: null };

function toForm(t: ContactTemplate | null): ContactTemplateCreateInput {
  if (!t) return EMPTY;
  return { kind: t.kind, name: t.name, subject: t.subject ?? '', body: t.body, sector_id: t.sector_id };
}

/** Pré-visualização com um lead real (ou só com a assinatura, sem lead). */
function Preview({ subject, body, isEmail }: { subject: string; body: string; isEmail: boolean }) {
  const { data: leads } = useLeads({ limit: 50, sort: 'updated_at', order: 'desc' });
  const [leadId, setLeadId] = useState('');
  const lead = leads?.data.find((l) => l.id === leadId) ?? leads?.data[0] ?? null;
  const context = useTemplateContext(lead);
  const s = renderTemplate(subject, context);
  const b = renderTemplate(body, context);
  const missing = [...new Set([...s.missing, ...b.missing])];
  const unknown = [...new Set([...s.unknown, ...b.unknown])];
  return (
    <section aria-label="Pré-visualização" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Pré-visualização com</h3>
        <Select
          aria-label="Lead para a pré-visualização"
          value={lead?.id ?? ''}
          onChange={(e) => setLeadId(e.target.value)}
          className="h-8 w-auto min-w-48 flex-1 text-sm"
        >
          {(leads?.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              #{l.number} {l.company_name}
            </option>
          ))}
          {!leads?.data.length ? <option value="">(sem leads)</option> : null}
        </Select>
      </div>
      {unknown.length ? (
        <p className="text-xs text-danger">Variáveis desconhecidas: {unknown.map((u) => `{{${u}}}`).join(', ')}</p>
      ) : null}
      {missing.length ? <p className="text-xs text-warning">Sem valor neste lead: {missing.join(', ')}</p> : null}
      <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
        {isEmail && s.text ? (
          <p className="mb-2 border-b border-border pb-2">
            <span className="text-muted">Assunto: </span>
            <strong>{s.text}</strong>
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{b.text || <span className="text-muted">(vazio)</span>}</p>
      </div>
    </section>
  );
}

function Editor({ template, onSaved, onDeleted }: { template: ContactTemplate | null; onSaved: (t: ContactTemplate) => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const { data: sectors } = useSectors();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ContactTemplateCreateInput, unknown, FormOutput>({
    resolver: zodResolver(ContactTemplateCreateSchema),
    defaultValues: toForm(template),
  });
  useEffect(() => reset(toForm(template)), [template, reset]);

  const [kind, subject, body] = useWatch({ control, name: ['kind', 'subject', 'body'] });
  const isEmail = EMAIL_KINDS.has(kind);
  const bodyField = register('body');

  function insertVariable(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    const current = getValues('body') ?? '';
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    setValue('body', current.slice(0, start) + token + current.slice(end), { shouldDirty: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const save = handleSubmit(async (values) => {
    try {
      const payload = { ...values, subject: isEmail ? values.subject : null };
      const { data } = template
        ? await api<{ data: ContactTemplate }>(`/templates/${template.id}`, { method: 'PATCH', body: payload })
        : await api<{ data: ContactTemplate }>('/templates', { method: 'POST', body: payload });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success(template ? 'Modelo guardado.' : 'Modelo criado.');
      onSaved(data);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  async function duplicate() {
    if (!template) return;
    try {
      const { data } = await api<{ data: ContactTemplate }>('/templates', {
        method: 'POST',
        body: { ...toForm(template), name: `${template.name} (cópia)`, subject: template.subject },
      });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Modelo duplicado.');
      onSaved(data);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function remove() {
    if (!template) return;
    try {
      await api(`/templates/${template.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Modelo apagado.');
      setConfirmDelete(false);
      onDeleted();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader
        title={template ? template.name : 'Novo modelo'}
        actions={
          template ? (
            <>
              <Button size="sm" variant="ghost" onClick={duplicate}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Apagar modelo">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          ) : null
        }
      />
      <form onSubmit={save} className="grid gap-4 p-4 lg:grid-cols-2" noValidate>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" error={errors.name?.message} required className="sm:col-span-2">
              <Input {...register('name')} />
            </Field>
            <Field label="Tipo" error={errors.kind?.message}>
              <Select {...register('kind')}>
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Setor (opcional)" hint="Sugerido primeiro para leads deste setor">
              <Select {...register('sector_id', { setValueAs: (v) => (v === '' ? null : v) })}>
                <option value="">Todos os setores</option>
                {(sectors ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {isEmail ? (
            <Field label="Assunto" error={errors.subject?.message}>
              <Input {...register('subject')} />
            </Field>
          ) : null}
          <Field label="Texto" error={errors.body?.message} required>
            <Textarea
              rows={14}
              {...bodyField}
              ref={(el) => {
                bodyField.ref(el);
                bodyRef.current = el;
              }}
              className="font-mono text-[13px] leading-relaxed"
            />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Inserir variável (no cursor):</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  title={v.label}
                  className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs hover:border-accent hover:text-accent-text"
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Dica: <code className="font-mono">{'{{contacto|equipa}}'}</code> usa “equipa” quando o lead não tem contacto.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Preview subject={subject ?? ''} body={body ?? ''} isEmail={isEmail} />
        </div>
        <div className="flex items-center justify-end gap-2 lg:col-span-2">
          {isDirty ? <span className="mr-auto text-sm text-muted">Alterações por guardar</span> : null}
          <Button type="submit" loading={isSubmitting}>
            {template ? 'Guardar modelo' : 'Criar modelo'}
          </Button>
        </div>
      </form>
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Apagar este modelo?"
        description={template ? `“${template.name}” deixa de estar disponível nas fichas dos leads.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove}>
              Apagar
            </Button>
          </>
        }
      />
    </Card>
  );
}

export function TemplateLibrary() {
  const { data: templates, isLoading } = useTemplates();
  const { data: sectors } = useSectors(true);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const current = useMemo(
    () => (selected === 'new' ? null : (templates?.find((t) => t.id === selected) ?? templates?.[0] ?? null)),
    [templates, selected],
  );

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label="Modelos" className="flex flex-col gap-4">
        <Button onClick={() => setSelected('new')} variant={selected === 'new' ? 'primary' : 'outline'}>
          <Plus className="h-4 w-4" aria-hidden /> Novo modelo
        </Button>
        {TEMPLATE_KINDS.map((kind: TemplateKind) => {
          const group = (templates ?? []).filter((t) => t.kind === kind);
          if (!group.length) return null;
          return (
            <div key={kind}>
              <h2 className="mb-1 px-2 font-sans text-xs font-semibold tracking-wide text-muted uppercase">{TEMPLATE_KIND_LABELS[kind]}</h2>
              <ul className="flex flex-col gap-0.5">
                {group.map((t) => {
                  const active = selected !== 'new' && current?.id === t.id;
                  const sector = sectors?.find((s) => s.id === t.sector_id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(t.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'w-full rounded-lg px-2 py-1.5 text-left text-sm',
                          active ? 'bg-accent-soft text-accent-text' : 'hover:bg-surface-2',
                        )}
                      >
                        {t.name}
                        {sector ? (
                          <Badge className="ml-1.5">
                            <SectorIconView sector={sector} className="h-3 w-3" />
                            {sector.name}
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <Editor
        key={current?.id ?? 'new'}
        template={selected === 'new' ? null : current}
        onSaved={(t) => setSelected(t.id)}
        onDeleted={() => setSelected(null)}
      />
    </div>
  );
}
