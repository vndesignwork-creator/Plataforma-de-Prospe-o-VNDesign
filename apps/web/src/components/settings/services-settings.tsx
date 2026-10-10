'use client';

import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  SERVICE_ICONS,
  SERVICE_ICON_KEYS,
  type Service,
  type ServiceCategory,
  type ServiceIconKey,
} from '@vndesign/core';
import { ArrowDown, ArrowUp, Edit3, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { CATEGORY_ICONS, SERVICE_ICON_COMPONENTS, ServiceGlyph } from '@/components/services/services';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useInvalidateServices, useServices } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface Draft {
  id: string | null;
  label: string;
  short_label: string;
  category: ServiceCategory;
  icon: ServiceIconKey;
}

const emptyDraft: Draft = { id: null, label: '', short_label: '', category: 'outros', icon: 'sparkles' };

function ServiceDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const invalidate = useInvalidateServices();
  const [form, setForm] = useState<Draft>(draft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    const body = { label: form.label, short_label: form.short_label || null, category: form.category, icon: form.icon };
    try {
      await api(form.id ? `/services/${form.id}` : '/services', { method: form.id ? 'PATCH' : 'POST', body });
      toast.success(form.id ? 'Serviço guardado.' : 'Serviço criado.');
      invalidate();
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={form.id ? 'Editar serviço' : 'Novo serviço'}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <Field label="Nome" required error={errors.label?.[0]} className="sm:col-span-2" hint="Ex.: Fotografia de produto, Gestão de redes sociais.">
          <Input value={form.label} maxLength={60} autoFocus onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <Field label="Categoria" error={errors.category?.[0]}>
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SERVICE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome curto (opcional)" error={errors.short_label?.[0]} hint="Nos cartões do Kanban. Sem nome curto, usa a 1.ª palavra.">
          <Input value={form.short_label} maxLength={14} onChange={(e) => setForm({ ...form, short_label: e.target.value })} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Ícone</legend>
          <div role="radiogroup" aria-label="Ícone do serviço" className="flex flex-wrap gap-1.5">
            {SERVICE_ICON_KEYS.map((key) => {
              const Icon = SERVICE_ICON_COMPONENTS[key];
              const selected = form.icon === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={SERVICE_ICONS[key]}
                  title={SERVICE_ICONS[key]}
                  onClick={() => setForm({ ...form, icon: key })}
                  className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
                    selected ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:border-border-strong hover:text-fg',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Definições → Serviços: os serviços que se escolhem nos leads, filtros, propostas e listas de tarefas. */
export function ServicesSettings() {
  const invalidate = useInvalidateServices();
  const { data: services, isLoading } = useServices(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** Troca com o serviço anterior/seguinte da mesma categoria. */
  function move(service: Service, direction: -1 | 1) {
    const all = services ?? [];
    const group = all.filter((s) => s.category === service.category);
    const i = group.findIndex((s) => s.id === service.id);
    const other = group[i + direction];
    if (!other) return;
    const ids = all.map((s) => (s.id === service.id ? other.id : s.id === other.id ? service.id : s.id));
    void run(() => api('/services/reorder', { method: 'POST', body: { ids } }), 'Ordem atualizada.');
  }

  const groups = SERVICE_CATEGORIES.map((category) => ({ category, items: (services ?? []).filter((s) => s.category === category) }));

  return (
    <Card id="servicos">
      <CardHeader
        title="Serviços"
        description="Os serviços que ofereces. Aparecem nos leads (serviços de interesse), nos filtros, nas propostas e nas listas de tarefas."
        actions={
          <Button size="sm" variant="outline" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo serviço
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-40" />
      ) : (
        <ul className="divide-y divide-border" aria-label="Serviços">
          {groups.map(({ category, items }) => {
            const CategoryIcon = CATEGORY_ICONS[category];
            return [
              <li
                key={`h-${category}`}
                className="flex items-center gap-1.5 bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                <CategoryIcon className="h-3.5 w-3.5" aria-hidden />
                {SERVICE_CATEGORY_LABELS[category]}
              </li>,
              ...(items.length
                ? items.map((s, i) => (
                    <li
                      key={s.id}
                      className={cn(
                        'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
                        s.archived_at && 'opacity-70',
                      )}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
                        <ServiceGlyph icon={s.icon} />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <span className="break-words">{s.label}</span>
                          {s.archived_at ? <Badge>Escondido</Badge> : null}
                        </p>
                        <p className="text-sm text-muted">
                          <span className="tabular">
                            {s.lead_count} lead{s.lead_count === 1 ? '' : 's'}
                          </span>
                          {s.short_label ? ` · nos cartões: ${s.short_label}` : ''}
                        </p>
                      </div>
                      <div className="col-start-2 -ml-2 flex flex-wrap gap-0.5 sm:col-start-auto sm:ml-0">
                        <Button size="icon" variant="ghost" aria-label={`Subir ${s.label}`} disabled={busy || i === 0} onClick={() => move(s, -1)}>
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Descer ${s.label}`}
                          disabled={busy || i === items.length - 1}
                          onClick={() => move(s, 1)}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${s.label}`}
                          onClick={() =>
                            setDraft({
                              id: s.id,
                              label: s.label,
                              short_label: s.short_label ?? '',
                              category: s.category,
                              icon: (s.icon && s.icon in SERVICE_ICON_COMPONENTS ? s.icon : 'sparkles') as ServiceIconKey,
                            })
                          }
                        >
                          <Edit3 className="h-4 w-4" aria-hidden />
                        </Button>
                        {s.archived_at ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Mostrar ${s.label}`}
                            title="Voltar a mostrar"
                            disabled={busy}
                            onClick={() => void run(() => api(`/services/${s.id}`, { method: 'PATCH', body: { archived: false } }), 'Serviço visível outra vez.')}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Esconder ${s.label}`}
                            title="Esconder (os leads que já o têm ficam com ele)"
                            disabled={busy}
                            onClick={() => void run(() => api(`/services/${s.id}`, { method: 'PATCH', body: { archived: true } }), 'Serviço escondido.')}
                          >
                            <EyeOff className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={s.lead_count ? `${s.label} tem leads: esconde em vez de apagar` : `Apagar ${s.label}`}
                          title={s.lead_count ? 'Tem leads — esconde em vez de apagar' : undefined}
                          disabled={busy || s.lead_count > 0}
                          onClick={() => setConfirm(s)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  ))
                : [
                    <li key={`e-${category}`} className="px-4 py-3 text-sm text-muted">
                      Sem serviços nesta categoria.
                    </li>,
                  ]),
            ];
          })}
        </ul>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted">
        Esconder tira o serviço das escolhas, mas os leads que já o têm continuam com ele. Só se pode apagar um serviço que
        nenhum lead tenha; os pacotes e as listas de tarefas desse serviço ficam “gerais”.
      </p>

      {draft ? <ServiceDialog key={draft.id ?? 'novo'} draft={draft} onClose={() => setDraft(null)} /> : null}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title={`Apagar "${confirm?.label ?? ''}"?`}
        description="Os pacotes e as listas de tarefas deste serviço ficam sem serviço (gerais)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const s = confirm;
                setConfirm(null);
                if (s) void run(() => api(`/services/${s.id}`, { method: 'DELETE' }), 'Serviço apagado.');
              }}
            >
              Apagar
            </Button>
          </>
        }
      />
    </Card>
  );
}
