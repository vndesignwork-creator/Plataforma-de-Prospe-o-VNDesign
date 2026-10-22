'use client';

import { SERVICE_ICONS, SERVICE_ICON_KEYS, type Service, type ServiceCategoryItem, type ServiceIconKey } from '@vndesign/core';
import { ArrowDown, ArrowUp, Edit3, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SERVICE_ICON_COMPONENTS, ServiceGlyph, useServiceCatalog } from '@/components/services/services';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useInvalidateServices, useServiceCategories, useServices } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface Draft {
  id: string | null;
  label: string;
  short_label: string;
  category: string;
  icon: ServiceIconKey;
  value_phrase: string;
  delivery_days: string;
  revisions_included: string;
}

const toIconKey = (icon: string | null | undefined, fallback: ServiceIconKey): ServiceIconKey =>
  icon && icon in SERVICE_ICON_COMPONENTS ? (icon as ServiceIconKey) : fallback;

/** Grelha de ícones (serviços e categorias). */
function IconPicker({ value, onChange, label }: { value: ServiceIconKey; onChange: (icon: ServiceIconKey) => void; label: string }) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1.5 text-sm font-medium">Ícone</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {SERVICE_ICON_KEYS.map((key) => {
          const Icon = SERVICE_ICON_COMPONENTS[key];
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={SERVICE_ICONS[key]}
              title={SERVICE_ICONS[key]}
              onClick={() => onChange(key)}
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
  );
}

const emptyDraft: Draft = {
  id: null,
  label: '',
  short_label: '',
  category: 'outros',
  icon: 'sparkles',
  value_phrase: '',
  delivery_days: '',
  revisions_included: '',
};
const numberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

function ServiceDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const invalidate = useInvalidateServices();
  const catalog = useServiceCatalog();
  const [form, setForm] = useState<Draft>(draft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    const body = {
      label: form.label,
      short_label: form.short_label || null,
      category: form.category,
      icon: form.icon,
      value_phrase: form.value_phrase.trim() || null,
      delivery_days: numberOrNull(form.delivery_days),
      revisions_included: numberOrNull(form.revisions_included),
    };
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
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {catalog.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome curto (opcional)" error={errors.short_label?.[0]} hint="Nos cartões do Kanban. Sem nome curto, usa a 1.ª palavra.">
          <Input value={form.short_label} maxLength={14} onChange={(e) => setForm({ ...form, short_label: e.target.value })} />
        </Field>
        <Field
          label="Frase de valor (opcional)"
          error={errors.value_phrase?.[0]}
          className="sm:col-span-2"
          hint="Usada nos scripts em {{beneficio}}. Completa: “Posso ajudar-vos a ter …”"
        >
          <Textarea
            rows={2}
            value={form.value_phrase}
            maxLength={300}
            placeholder="Ex.: uma imagem coerente que os clientes reconhecem à primeira vista"
            onChange={(e) => setForm({ ...form, value_phrase: e.target.value })}
          />
        </Field>
        <Field label="Prazo de entrega (dias)" error={errors.delivery_days?.[0]} hint="Ao passar a Cliente, o prazo do projeto fica a contar daqui.">
          <Input type="number" inputMode="numeric" min={1} max={365} value={form.delivery_days} onChange={(e) => setForm({ ...form, delivery_days: e.target.value })} placeholder="Ex.: 30" />
        </Field>
        <Field label="Revisões incluídas" error={errors.revisions_included?.[0]} hint="Rondas de revisão incluídas no preço deste serviço.">
          <Input type="number" inputMode="numeric" min={0} max={50} value={form.revisions_included} onChange={(e) => setForm({ ...form, revisions_included: e.target.value })} placeholder="Ex.: 2" />
        </Field>
        <IconPicker label="Ícone do serviço" value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Lista de serviços, agrupada pelas categorias. */
function ServicesList() {
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

  const catalog = useServiceCatalog();
  const groups = catalog.categories.map((c) => ({ category: c.key, items: (services ?? []).filter((s) => s.category === c.key) }));

  return (
    <Card id="servicos">
      <CardHeader
        title="Serviços"
        description="Os serviços que ofereces. Aparecem nos leads (serviços de interesse), nos filtros, nas propostas e nas listas de tarefas."
        actions={
          <Button size="sm" variant="outline" onClick={() => setDraft({ ...emptyDraft, category: catalog.categories.at(-1)?.key ?? 'outros' })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo serviço
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-40" />
      ) : (
        <ul className="divide-y divide-border" aria-label="Serviços">
          {groups.map(({ category, items }) => {
            return [
              <li
                key={`h-${category}`}
                className="flex items-center gap-1.5 bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                <ServiceGlyph icon={catalog.categoryIcon(category)} className="h-3.5 w-3.5" />
                {catalog.categoryLabel(category)}
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
                        {s.value_phrase ? <p className="text-sm break-words text-muted italic">“{s.value_phrase}”</p> : null}
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
                              icon: toIconKey(s.icon, 'sparkles'),
                              value_phrase: s.value_phrase ?? '',
                              delivery_days: s.delivery_days === null ? '' : String(s.delivery_days),
                              revisions_included: s.revisions_included === null ? '' : String(s.revisions_included),
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

interface CategoryDraft {
  id: string | null;
  label: string;
  icon: ServiceIconKey;
  design_portfolio: boolean;
}

function CategoryDialog({ draft, onClose }: { draft: CategoryDraft; onClose: () => void }) {
  const invalidate = useInvalidateServices();
  const [form, setForm] = useState<CategoryDraft>(draft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      await api(form.id ? `/service-categories/${form.id}` : '/service-categories', {
        method: form.id ? 'PATCH' : 'POST',
        body: { label: form.label, icon: form.icon, design_portfolio: form.design_portfolio },
      });
      toast.success(form.id ? 'Categoria guardada.' : 'Categoria criada.');
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
      title={form.id ? 'Editar categoria' : 'Nova categoria'}
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
        <Field label="Nome" required error={errors.label?.[0]} className="sm:col-span-2" hint="Ex.: Fotografia & Vídeo, Marketing Digital.">
          <Input value={form.label} maxLength={60} autoFocus onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <IconPicker label="Ícone da categoria" value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={form.design_portfolio}
            onChange={(e) => setForm({ ...form, design_portfolio: e.target.checked })}
          />
          <span>
            Usar o portefólio de design no email com IA
            <span className="block text-xs text-muted">
              Para os serviços desta categoria, o email inclui o link do portefólio de design gráfico (Definições → Assinatura).
            </span>
          </span>
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Categorias: criar, mudar o nome/ícone, ordenar e apagar (só vazias). */
function CategoriesList() {
  const invalidate = useInvalidateServices();
  const { data: categories, isLoading } = useServiceCategories();
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [confirm, setConfirm] = useState<ServiceCategoryItem | null>(null);
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

  function move(index: number, direction: -1 | 1) {
    const list = [...(categories ?? [])];
    const other = index + direction;
    if (!list[other]) return;
    [list[index], list[other]] = [list[other]!, list[index]!];
    void run(() => api('/service-categories/reorder', { method: 'POST', body: { ids: list.map((c) => c.id) } }), 'Ordem atualizada.');
  }

  const usage = (c: ServiceCategoryItem) =>
    [
      `${c.service_count} serviço${c.service_count === 1 ? '' : 's'}`,
      c.package_count ? `${c.package_count} pacote${c.package_count === 1 ? '' : 's'}` : null,
      c.design_portfolio ? 'portefólio de design no email' : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <Card id="categorias">
      <CardHeader
        title="Categorias"
        description="Agrupam os serviços no formulário do lead, nos filtros e nos pacotes das propostas."
        actions={
          <Button size="sm" variant="outline" onClick={() => setDraft({ id: null, label: '', icon: 'grid', design_portfolio: false })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Nova categoria
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-24" />
      ) : (
        <ul className="divide-y divide-border" aria-label="Categorias">
          {(categories ?? []).map((c, i, list) => {
            const inUse = c.service_count > 0 || c.package_count > 0;
            return (
              <li
                key={c.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
                  <ServiceGlyph icon={c.icon} />
                </span>
                <div className="min-w-0">
                  <p className="font-medium break-words">{c.label}</p>
                  <p className="text-sm text-muted">{usage(c)}</p>
                </div>
                <div className="col-start-2 -ml-2 flex flex-wrap gap-0.5 sm:col-start-auto sm:ml-0">
                  <Button size="icon" variant="ghost" aria-label={`Subir ${c.label}`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Descer ${c.label}`}
                    disabled={busy || i === list.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${c.label}`}
                    onClick={() => setDraft({ id: c.id, label: c.label, icon: toIconKey(c.icon, 'grid'), design_portfolio: c.design_portfolio })}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={inUse ? `${c.label} tem serviços ou pacotes: muda-os primeiro` : `Apagar ${c.label}`}
                    title={inUse ? 'Tem serviços ou pacotes — muda-os de categoria primeiro' : undefined}
                    disabled={busy || inUse}
                    onClick={() => setConfirm(c)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft ? <CategoryDialog key={draft.id ?? 'nova'} draft={draft} onClose={() => setDraft(null)} /> : null}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title={`Apagar "${confirm?.label ?? ''}"?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c) void run(() => api(`/service-categories/${c.id}`, { method: 'DELETE' }), 'Categoria apagada.');
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

/** Definições → Serviços: os serviços (e as suas categorias) que se escolhem nos leads, filtros, propostas e listas de tarefas. */
export function ServicesSettings() {
  return (
    <div className="flex flex-col gap-5">
      <CategoriesList />
      <ServicesList />
    </div>
  );
}
