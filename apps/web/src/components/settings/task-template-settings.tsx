'use client';

import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS, serviceLabel, servicesOf, type ServiceKey, type TaskTemplate } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ServiceIcon } from '@/components/services/services';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useTaskTemplates } from '@/lib/queries';

interface Draft {
  id: string | null;
  name: string;
  service: ServiceKey | '';
  items: string;
}

const emptyDraft: Draft = { id: null, name: '', service: '', items: '' };

function TemplateDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Draft>(draft ?? emptyDraft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    const body = { name: form.name, service: form.service || null, items: form.items.split('\n') };
    try {
      await api(form.id ? `/task-templates/${form.id}` : '/task-templates', { method: form.id ? 'PATCH' : 'POST', body });
      toast.success(form.id ? 'Lista guardada.' : 'Lista criada.');
      void qc.invalidateQueries({ queryKey: ['task-templates'] });
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const count = form.items.split('\n').filter((l) => l.trim()).length;
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={form.id ? 'Editar lista de tarefas' : 'Nova lista de tarefas'}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errors.name?.[0]}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Serviço" hint="Sugerida nos leads com este serviço." error={errors.service?.[0]}>
          <Select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value as ServiceKey | '' })}>
            <option value="">— Nenhum —</option>
            {SERVICE_CATEGORIES.map((c) => (
              <optgroup key={c} label={SERVICE_CATEGORY_LABELS[c]}>
                {servicesOf(c).map((k) => (
                  <option key={k} value={k}>
                    {serviceLabel(k)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            label={`Tarefas (uma por linha) · ${count}`}
            required
            error={errors.items?.[0] ?? Object.entries(errors).find(([k]) => k.startsWith('items.'))?.[1]?.[0]}
          >
            <Textarea rows={12} value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

/** Definições → Listas de tarefas: as listas prontas que se aplicam a um lead (uma por serviço). */
export function TaskTemplateSettings() {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useTaskTemplates();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<TaskTemplate | null>(null);

  async function remove(t: TaskTemplate) {
    try {
      await api(`/task-templates/${t.id}`, { method: 'DELETE' });
      toast.success('Lista apagada.');
      void qc.invalidateQueries({ queryKey: ['task-templates'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setConfirm(null);
    }
  }

  return (
    <Card id="listas-tarefas">
      <CardHeader
        title="Listas de tarefas"
        description="Passos prontos a usar nas tarefas de um lead — por exemplo, quando passa a cliente. Os leads sugerem as listas dos seus serviços."
        actions={
          <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nova lista
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-32" />
      ) : !templates?.length ? (
        <p className="p-4 text-sm text-muted">Ainda não há listas.</p>
      ) : (
        <ul aria-label="Listas de tarefas" className="divide-y divide-border">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              {t.service ? <ServiceIcon service={t.service} className="h-4 w-4 shrink-0 text-muted" /> : <ListChecks className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-muted">
                  {t.items.length} tarefa{t.items.length === 1 ? '' : 's'}
                  {t.service ? ` · ${serviceLabel(t.service)}` : ''}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Editar ${t.name}`}
                onClick={() => setDraft({ id: t.id, name: t.name, service: t.service ?? '', items: t.items.join('\n') })}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Apagar ${t.name}`} onClick={() => setConfirm(t)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {draft ? <TemplateDialog key={draft.id ?? 'nova'} draft={draft} onClose={() => setDraft(null)} /> : null}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => (!open ? setConfirm(null) : undefined)}
        title={`Apagar "${confirm?.name ?? ''}"?`}
        description="As tarefas já criadas nos leads ficam como estão."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => confirm && void remove(confirm)}>
              Apagar
            </Button>
          </>
        }
      />
    </Card>
  );
}
