'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ContactTemplateCreateSchema,
  TEMPLATE_KIND_LABELS,
  TEMPLATE_KINDS,
  isRichHtml,
  renderTemplate,
  richInline,
  sanitizeRichHtml,
  textToRichHtml,
  toPlainText,
  type ContactTemplate,
  type ContactTemplateCreateInput,
  type EmailStats,
  type TemplateContext,
  type TemplateKind,
} from '@vndesign/core';
import {
  Briefcase,
  ChevronRight,
  Copy,
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Phone,
  Plus,
  Repeat,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FormSaveBar } from '@/components/ui/form-save-bar';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useLeads, useSectors, useSignature, useTemplates } from '@/lib/queries';
import { EMAIL_KINDS, useTemplateContext } from '@/lib/template-context';
import { cn } from '@/lib/utils';
import { SectorIconView } from '@/components/icons/lead-icons';
import { SingleSelectFilter } from '@/components/leads/multi-select';
import { useServiceCatalog } from '@/components/services/services';
import { TemplateBodyEditor } from './template-body-editor';

type FormOutput = z.output<typeof ContactTemplateCreateSchema>;

const EMPTY: ContactTemplateCreateInput = { kind: 'cold_email', name: '', subject: '', body: '', sector_id: null, category: null };
const CHAT_KINDS = new Set<string>(['whatsapp', 'short_message', 'social_dm', 'linkedin']);
const KIND_ICONS: Record<TemplateKind, LucideIcon> = {
  cold_email: Mail,
  follow_up: Repeat,
  call_script: Phone,
  social_dm: MessageSquare,
  linkedin: Briefcase,
  short_message: MessageSquareText,
  general_email: Mail,
  proposal_structure: FileText,
  whatsapp: MessageCircle,
};
const LEAVE = 'Tens alterações por guardar neste modelo. Sair sem guardar?';

function toForm(t: ContactTemplate | null): ContactTemplateCreateInput {
  if (!t) return EMPTY;
  return { kind: t.kind, name: t.name, subject: t.subject ?? '', body: t.body, sector_id: t.sector_id, category: t.category };
}

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi;

/**
 * O modelo em HTML com cada variável marcada: o que veio do lead fica sublinhado
 * e o que falta aparece como etiqueta amarela (os valores entram escapados).
 */
function previewHtml(template: string, context: TemplateContext): string {
  const html = isRichHtml(template) ? sanitizeRichHtml(template) : textToRichHtml(template);
  return html.replace(PLACEHOLDER, (token: string, key: string) => {
    const r = renderTemplate(token.replace(/&amp;/g, '&'), context);
    if (r.unknown.length) return `<mark class="tpl-unknown">${token}</mark>`;
    if (!r.text) return `<mark class="tpl-missing">${key.toLowerCase()}</mark>`;
    return `<mark class="tpl-filled">${richInline(r.text)}</mark>`;
  });
}

/** Pré-visualização com um lead real: como um email, como uma conversa ou como um guião. */
function Preview({ subject, body, kind }: { subject: string; body: string; kind: TemplateKind }) {
  const { data: leads } = useLeads({ limit: 50, sort: 'updated_at', order: 'desc' });
  const { data: signature } = useSignature();
  const [leadId, setLeadId] = useState('');
  const lead = leads?.data.find((l) => l.id === leadId) ?? leads?.data[0] ?? null;
  const context = useTemplateContext(lead);
  const s = renderTemplate(subject, context);
  const b = renderTemplate(body, context);
  const missing = [...new Set([...s.missing, ...b.missing])];
  const unknown = [...new Set([...s.unknown, ...b.unknown])];
  const html = body.trim() ? previewHtml(body, context) : '';
  const isEmail = EMAIL_KINDS.has(kind);
  const content = html ? (
    <div
      className={cn(
        'text-sm leading-relaxed break-words [&_a]:text-accent-text [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6',
        '[&_.tpl-filled]:bg-transparent [&_.tpl-filled]:text-inherit [&_.tpl-filled]:underline [&_.tpl-filled]:decoration-accent/60 [&_.tpl-filled]:decoration-dotted [&_.tpl-filled]:underline-offset-4',
        '[&_.tpl-missing]:rounded [&_.tpl-missing]:bg-warning-soft [&_.tpl-missing]:px-1 [&_.tpl-missing]:text-xs [&_.tpl-missing]:text-warning',
        '[&_.tpl-unknown]:rounded [&_.tpl-unknown]:bg-danger-soft [&_.tpl-unknown]:px-1 [&_.tpl-unknown]:text-danger',
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <p className="text-sm text-muted">(vazio)</p>
  );

  return (
    <section aria-label="Pré-visualização" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Pré-visualização com</h2>
        <Select
          aria-label="Lead para a pré-visualização"
          value={lead?.id ?? ''}
          onChange={(e) => setLeadId(e.target.value)}
          className="h-8 w-auto min-w-0 flex-[1_1_12rem] text-sm"
        >
          {(leads?.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              #{l.number} {l.company_name}
            </option>
          ))}
          {!leads?.data.length ? <option value="">(sem leads)</option> : null}
        </Select>
      </div>
      {unknown.length ? <p className="text-xs text-danger">Variáveis desconhecidas: {unknown.map((u) => `{{${u}}}`).join(', ')}</p> : null}
      {missing.length ? <p className="text-xs text-warning">Sem valor neste lead: {missing.join(', ')}</p> : null}

      {isEmail ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-xs">
            <dt className="text-muted">De</dt>
            <dd className="truncate">
              {signature?.full_name || '—'}
              {signature?.email ? <span className="text-muted"> &lt;{signature.email}&gt;</span> : null}
            </dd>
            <dt className="text-muted">Para</dt>
            <dd className="truncate">{lead ? (lead.email ?? <span className="text-warning">{lead.company_name} (sem email)</span>) : '—'}</dd>
            <dt className="text-muted">Assunto</dt>
            <dd className="font-semibold break-words">{s.text || <span className="font-normal text-muted">(sem assunto)</span>}</dd>
          </dl>
          <div className="p-3">{content}</div>
        </div>
      ) : CHAT_KINDS.has(kind) ? (
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-success/15 px-3 py-2">{content}</div>
          <p className="mt-1 text-right text-[11px] text-muted">Como aparece na conversa</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-2 p-3">{content}</div>
      )}
      <p className="text-xs text-muted">
        <span className="underline decoration-accent/60 decoration-dotted underline-offset-4">Sublinhado</span>: veio do lead ou dos teus dados.
      </p>
    </section>
  );
}

function Editor({
  template,
  onSaved,
  onDeleted,
  onDirty,
}: {
  template: ContactTemplate | null;
  onSaved: (t: ContactTemplate) => void;
  onDeleted: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: sectors } = useSectors();
  const catalog = useServiceCatalog();
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
  useEffect(() => {
    onDirty(isDirty);
  }, [isDirty, onDirty]);
  const [kind, subject, body] = useWatch({ control, name: ['kind', 'subject', 'body'] });
  const isEmail = EMAIL_KINDS.has(kind);

  // Email → WhatsApp/chamada: a formatação sai (estas mensagens são só texto).
  const lastKind = useRef(kind);
  useEffect(() => {
    if (lastKind.current === kind) return;
    lastKind.current = kind;
    const current = getValues('body') ?? '';
    if (!EMAIL_KINDS.has(kind) && isRichHtml(current)) setValue('body', toPlainText(current), { shouldDirty: true });
  }, [kind, getValues, setValue]);

  const save = handleSubmit(async (values) => {
    try {
      const payload = { ...values, subject: isEmail ? values.subject : null };
      const { data } = template
        ? await api<{ data: ContactTemplate }>(`/templates/${template.id}`, { method: 'PATCH', body: payload })
        : await api<{ data: ContactTemplate }>('/templates', { method: 'POST', body: payload });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success(template ? 'Modelo guardado.' : 'Modelo criado.');
      reset(toForm(data));
      onSaved(data);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  async function duplicate() {
    if (!template) return;
    if (isDirty && !window.confirm(LEAVE)) return;
    try {
      const { data } = await api<{ data: ContactTemplate }>('/templates', {
        method: 'POST',
        body: { ...toForm(template), name: `${template.name} (cópia)`, subject: template.subject },
      });
      await qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Modelo duplicado.');
      reset(toForm(template));
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
      reset(toForm(null));
      onDeleted();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card className="@container">
      <form onSubmit={save} noValidate>
        {/* Cabeçalho: o nome edita-se no próprio título. */}
        <div className="flex flex-wrap items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-[1_1_16rem]">
            <input
              {...register('name')}
              aria-label="Nome"
              aria-invalid={errors.name ? true : undefined}
              placeholder={template ? 'Nome do modelo' : 'Nome do novo modelo'}
              className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-display text-lg font-semibold outline-none hover:border-border focus:border-accent aria-[invalid=true]:border-danger"
            />
            {errors.name?.message ? (
              <p role="alert" className="px-1.5 text-xs font-medium text-danger">
                {errors.name.message}
              </p>
            ) : null}
          </div>
          {template ? (
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={duplicate}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Apagar modelo">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>

        {/* Lado a lado só quando o cartão é largo (container query); senão, a pré-visualização fica por baixo. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @3xl:gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-3 @md:grid-cols-3">
              <Field label="Tipo" error={errors.kind?.message}>
                <Select {...register('kind')} className="h-9">
                  {TEMPLATE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {TEMPLATE_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Categoria de serviço">
                <Select {...register('category', { setValueAs: (v) => (v === '' ? null : v) })} className="h-9">
                  <option value="">Todas as categorias</option>
                  {catalog.categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Setor (opcional)">
                <Select {...register('sector_id', { setValueAs: (v) => (v === '' ? null : v) })} className="h-9">
                  <option value="">Todos os setores</option>
                  {(sectors ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="-mt-1 text-xs text-muted @md:col-span-3">A categoria e o setor decidem que modelo é sugerido primeiro em cada lead.</p>
            </div>
            {isEmail ? (
              <Field label="Assunto" error={errors.subject?.message}>
                <Input {...register('subject')} placeholder="Uma ideia para a {{empresa}}" />
              </Field>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">
                Texto <span className="text-accent-text" aria-hidden>*</span>
                {isEmail ? <span className="ml-1 text-xs font-normal text-muted">com formatação (o email sai assim)</span> : null}
              </p>
              <Controller
                control={control}
                name="body"
                render={({ field }) => (
                  <TemplateBodyEditor rich={isEmail} value={field.value ?? ''} onChange={field.onChange} invalid={!!errors.body} />
                )}
              />
              {errors.body?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.body.message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 @3xl:sticky @3xl:top-4 @3xl:self-start">
            <Preview subject={subject ?? ''} body={body ?? ''} kind={kind} />
          </div>
        </div>
        <div className="px-4 pb-4">
          <FormSaveBar dirty={isDirty} saving={isSubmitting} onDiscard={() => reset(toForm(template))}>
            {template ? 'Guardar modelo' : 'Criar modelo'}
          </FormSaveBar>
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

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Envios, aberturas e respostas por modelo (últimos 90 dias), para escolher o que resulta. */
function useTemplateStats() {
  const { data } = useQuery({
    queryKey: ['stats-emails', 90],
    queryFn: () => api<{ data: EmailStats }>('/stats/emails', { query: { days: 90 } }).then((r) => r.data),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return useMemo(() => new Map((data?.templates ?? []).flatMap((t) => (t.template ? [[t.template, t] as const] : []))), [data]);
}

export function TemplateLibrary() {
  const { data: templates, isLoading } = useTemplates();
  const { data: sectors } = useSectors(true);
  const catalog = useServiceCatalog();
  const stats = useTemplateStats();
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  // Grupos fechados por omissão (o do modelo aberto fica com o ícone a laranja).
  const [opened, setOpened] = useState<Partial<Record<TemplateKind, boolean>>>({});
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const onDirty = useMemo(
    () => (d: boolean) => {
      dirty.current = d;
    },
    [],
  );

  // Mudar de modelo com alterações por guardar pergunta antes (o editor recomeça do zero).
  function choose(id: string | 'new') {
    if (dirty.current && !window.confirm(LEAVE)) return;
    dirty.current = false;
    setSelected(id);
    // No telemóvel/tablet o editor fica por baixo da lista: ao escolher, desce até ele.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  const current = useMemo(
    () => (selected === 'new' ? null : (templates?.find((t) => t.id === selected) ?? templates?.[0] ?? null)),
    [templates, selected],
  );

  if (isLoading) return <Skeleton className="h-96" />;

  const q = norm(query.trim());
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label="Modelos" className="flex flex-col gap-2.5">
        <Button onClick={() => choose('new')} variant={selected === 'new' ? 'primary' : 'outline'}>
          <Plus className="h-4 w-4" aria-hidden /> Novo modelo
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar modelo…" aria-label="Procurar modelo" className="pl-9" />
        </div>
        {/* Uma categoria mostra os seus modelos e os de todas as categorias (que também lhe servem). */}
        <SingleSelectFilter
          label="Categoria dos modelos"
          value={category}
          onChange={setCategory}
          options={[{ value: '', label: 'Todas as categorias' }, ...catalog.categories.map((c) => ({ value: c.key, label: c.label }))]}
          className="w-full"
        />
        {TEMPLATE_KINDS.map((kind: TemplateKind) => {
          const group = (templates ?? []).filter(
            (t) => t.kind === kind && (!category || !t.category || t.category === category) && (!q || norm(t.name).includes(q)),
          );
          if (!group.length) return null;
          // Ao procurar, os grupos abrem-se todos.
          const hasCurrent = selected !== 'new' && group.some((t) => t.id === current?.id);
          const open = !!q || !!opened[kind];
          const Icon = KIND_ICONS[kind];
          return (
            <section
              key={kind}
              aria-label={TEMPLATE_KIND_LABELS[kind]}
              className={cn('overflow-hidden rounded-xl border bg-surface', open ? 'border-border-strong' : 'border-border')}
            >
              <button
                type="button"
                onClick={() => setOpened((o) => ({ ...o, [kind]: !open }))}
                aria-expanded={open}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    hasCurrent ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{TEMPLATE_KIND_LABELS[kind]}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-normal text-muted tabular-nums">{group.length}</span>
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-90')} aria-hidden />
              </button>
              {open ? (
                <ul className="flex flex-col gap-0.5 border-t border-border p-1.5">
                  {group.map((t) => {
                    const active = selected !== 'new' && current?.id === t.id;
                    const sector = sectors?.find((s) => s.id === t.sector_id);
                    const stat = stats.get(t.name);
                    const meta = [
                      !category && t.category ? catalog.categoryLabel(t.category) : null,
                      stat?.sent ? `${stat.sent} ${stat.sent === 1 ? 'enviado' : 'enviados'}` : null,
                      stat?.sent ? `${Math.round((stat.replied / stat.sent) * 100)}% respostas` : null,
                    ].filter(Boolean);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => choose(t.id)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-sm',
                            active ? 'bg-accent-soft text-accent-text' : 'hover:bg-surface-2',
                          )}
                        >
                          <span className="leading-snug">{t.name}</span>
                          {meta.length || sector ? (
                            <span className={cn('flex flex-wrap items-center gap-x-1.5 text-xs', active ? 'text-accent-text/80' : 'text-muted')}>
                              {meta.join(' · ')}
                              {sector ? (
                                <span className="inline-flex items-center gap-1">
                                  {meta.length ? '· ' : ''}
                                  <SectorIconView sector={sector} className="h-3 w-3" />
                                  {sector.name}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
        {q && !(templates ?? []).some((t) => norm(t.name).includes(q)) ? <p className="px-2 text-sm text-muted">Nenhum modelo com esse nome.</p> : null}
      </nav>
      <div ref={editorRef} className="min-w-0 scroll-mt-20">
        <Editor
          key={current?.id ?? 'new'}
          template={selected === 'new' ? null : current}
          onSaved={(t) => {
            dirty.current = false;
            setSelected(t.id);
          }}
          onDeleted={() => {
            dirty.current = false;
            setSelected(null);
          }}
          onDirty={onDirty}
        />
      </div>
    </div>
  );
}
