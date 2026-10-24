'use client';

/**
 * Definições → Campos personalizados: os campos próprios dos leads ("Nº de
 * lojas", "Programa de faturação", "Tem Instagram?"). Aparecem na ficha (linhas
 * do Pipeline), nos filtros da lista (escolhas e sim/não) e na exportação.
 */
import { CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS, type CustomField, type CustomFieldType } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCustomFields } from '@/components/leads/custom-fields';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

type Draft = { id: string | null; label: string; type: CustomFieldType; options: string };

export function CustomFieldsSettings() {
  const { data: fields, isLoading } = useCustomFields();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<CustomField | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    for (const key of ['custom-fields', 'leads', 'lead']) void qc.invalidateQueries({ queryKey: [key] });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    const options = draft.options.split('\n').map((o) => o.trim()).filter(Boolean);
    try {
      if (draft.id) await api(`/custom-fields/${draft.id}`, { method: 'PATCH', body: { label: draft.label, ...(draft.type === 'choice' ? { options } : {}) } });
      else await api('/custom-fields', { method: 'POST', body: { label: draft.label, type: draft.type, options } });
      toast.success(draft.id ? 'Campo guardado.' : `Campo “${draft.label.trim()}” criado.`);
      setDraft(null);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function move(field: CustomField, dir: -1 | 1) {
    const list = fields ?? [];
    const i = list.findIndex((f) => f.id === field.id);
    const other = list[i + dir];
    if (!other) return;
    try {
      await Promise.all([
        api(`/custom-fields/${field.id}`, { method: 'PATCH', body: { sort_order: other.sort_order } }),
        api(`/custom-fields/${other.id}`, { method: 'PATCH', body: { sort_order: field.sort_order === other.sort_order ? field.sort_order + dir : field.sort_order } }),
      ]);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(field: CustomField) {
    setBusy(true);
    try {
      await api(`/custom-fields/${field.id}`, { method: 'DELETE' });
      toast.success(`Campo “${field.label}” apagado.`);
      setDeleting(null);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Campos personalizados"
        description="Os teus próprios campos nos leads (ex.: “Nº de lojas”, “Programa de faturação”, “Tem Instagram?”). Aparecem na ficha, nos filtros da lista (escolhas e sim/não) e na exportação."
        actions={
          <Button size="sm" variant="outline" onClick={() => setDraft({ id: null, label: '', type: 'text', options: '' })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo campo
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-32" />
      ) : !fields?.length ? (
        <p className="flex items-center gap-2 p-4 text-sm text-muted">
          <ListPlus className="h-4 w-4" aria-hidden /> Ainda não há campos. Cria o primeiro em “Novo campo”.
        </p>
      ) : (
        <ul aria-label="Campos personalizados" className="divide-y divide-border">
          {fields.map((f, i) => (
            <li key={f.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.label}</p>
                <p className="truncate text-xs text-muted">
                  {CUSTOM_FIELD_TYPE_LABELS[f.type]}
                  {f.type === 'choice' ? `: ${f.options.join(', ')}` : ''}
                </p>
              </div>
              <Button size="icon" variant="ghost" aria-label={`Subir ${f.label}`} disabled={i === 0} onClick={() => void move(f, -1)}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Descer ${f.label}`} disabled={i === fields.length - 1} onClick={() => void move(f, 1)}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Editar ${f.label}`} onClick={() => setDraft({ id: f.id, label: f.label, type: f.type, options: f.options.join('\n') })}>
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" className="text-danger" aria-label={`Apagar ${f.label}`} onClick={() => setDeleting(f)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setDraft(null) : undefined)}
          title={draft.id ? 'Editar campo' : 'Novo campo'}
          className="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" form="custom-field" loading={busy} disabled={!draft.label.trim()}>
                Guardar
              </Button>
            </>
          }
        >
          <form
            id="custom-field"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="Nome">
              <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} maxLength={60} placeholder="Ex.: Nº de lojas" />
            </Field>
            <Field label="Tipo" hint={draft.id ? 'O tipo não muda depois de criado.' : undefined}>
              <Select value={draft.type} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })}>
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CUSTOM_FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {draft.type === 'choice' ? (
              <Field label="Opções" hint="Uma por linha (pelo menos 2).">
                <Textarea rows={4} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder={'Primavera\nMoloni\nInvoiceXpress'} />
              </Field>
            ) : null}
          </form>
        </Dialog>
      ) : null}

      {deleting ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setDeleting(null) : undefined)}
          title={`Apagar “${deleting.label}”?`}
          description="O campo sai de todos os leads, com os valores que tinham. Não pode ser desfeito."
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void remove(deleting)} loading={busy}>
                Apagar campo
              </Button>
            </>
          }
        />
      ) : null}
    </Card>
  );
}
