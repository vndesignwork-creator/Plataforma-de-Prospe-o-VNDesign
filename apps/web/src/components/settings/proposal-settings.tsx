'use client';

import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  formatCurrency,
  parseEuroAmount,
  serviceLabel,
  servicesOf,
  type ServiceCategory,
  type ServiceKey,
  type ServicePackage,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { CATEGORY_ICONS, ServiceIcon } from '@/components/services/services';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { usePackages, useSettings, type SettingsWithMail } from '@/lib/queries';

interface PackageDraft {
  id: string | null;
  name: string;
  description: string;
  price: string;
  delivery_days: string;
  features: string;
  recommended: boolean;
  category: ServiceCategory;
  service: ServiceKey | '';
}

const emptyDraft: PackageDraft = {
  id: null,
  name: '',
  description: '',
  price: '',
  delivery_days: '',
  features: '',
  recommended: false,
  category: 'web',
  service: '',
};
const toDraft = (p: ServicePackage): PackageDraft => ({
  id: p.id,
  name: p.name,
  description: p.description ?? '',
  price: String(p.price).replace('.', ','),
  delivery_days: p.delivery_days ? String(p.delivery_days) : '',
  features: p.features.join('\n'),
  recommended: p.recommended,
  category: p.category ?? 'web',
  service: p.service ?? '',
});

function PackageDialog({ draft, onClose }: { draft: PackageDraft | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PackageDraft>(draft ?? emptyDraft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- novo pacote/edição: repõe o formulário
    setForm(draft ?? emptyDraft);
    setErrors({});
  }, [draft]);

  async function save() {
    setSaving(true);
    const price = parseEuroAmount(form.price) ?? Number.NaN;
    const body = {
      name: form.name,
      description: form.description || null,
      price: Number.isFinite(price) ? price : -1,
      delivery_days: form.delivery_days ? Number(form.delivery_days) : null,
      features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
      recommended: form.recommended,
      category: form.category,
      service: form.service || null,
    };
    try {
      if (form.id) await api(`/packages/${form.id}`, { method: 'PATCH', body });
      else await api('/packages', { method: 'POST', body });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      toast.success(form.id ? 'Pacote guardado.' : 'Pacote criado.');
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={form.id ? 'Editar pacote' : 'Novo pacote'}
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
        <div className="sm:col-span-2">
          <Field label="Nome" required error={errors.name?.[0]}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Categoria">
          <Select
            value={form.category}
            onChange={(e) => {
              const category = e.target.value as ServiceCategory;
              // O serviço tem de pertencer à categoria escolhida.
              setForm({ ...form, category, service: form.service && servicesOf(category).includes(form.service) ? form.service : '' });
            }}
          >
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SERVICE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Serviço" hint="Sugere este pacote para leads com este interesse.">
          <Select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value as ServiceKey | '' })}>
            <option value="">Geral (toda a categoria)</option>
            {servicesOf(form.category).map((k) => (
              <option key={k} value={k}>
                {serviceLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preço (€)" required error={errors.price?.[0]} hint="Sem IVA. Para manutenção, o preço mensal.">
          <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        <Field label="Prazo (dias)" error={errors.delivery_days?.[0]}>
          <Input inputMode="numeric" value={form.delivery_days} onChange={(e) => setForm({ ...form, delivery_days: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Descrição">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="O que inclui (uma linha por ponto)">
            <Textarea rows={6} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.recommended}
            onChange={(e) => setForm({ ...form, recommended: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          Recomendado (entra por omissão nas novas propostas)
        </label>
      </div>
    </Dialog>
  );
}

export function ProposalSettings() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: packages } = usePackages();
  const [validity, setValidity] = useState('30');
  const [payment, setPayment] = useState('');
  const [tax, setTax] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PackageDraft | null>(null);

  useEffect(() => {
    if (!settings) return;
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza o formulário com os dados carregados */
    setValidity(String(settings.proposal.validity_days));
    setPayment(settings.proposal.payment_terms);
    setTax(settings.proposal.tax_note);
    setNextSteps(settings.proposal.next_steps);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [settings]);

  async function saveTexts(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api<{ data: SettingsWithMail }>('/settings', {
        method: 'PATCH',
        body: { proposal: { validity_days: Number(validity), payment_terms: payment, tax_note: tax, next_steps: nextSteps } },
      });
      qc.setQueryData(['settings'], data);
      toast.success('Textos das propostas guardados.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: ServicePackage) {
    try {
      await api(`/packages/${p.id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      toast.success(`Pacote "${p.name}" apagado.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-64" />;

  return (
    <Card id="propostas">
      <CardHeader
        title="Propostas e IA"
        description="Pacotes de Web Design e de Design Gráfico, textos do PDF e o gerador de emails com IA."
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing({ ...emptyDraft })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo pacote
          </Button>
        }
      />
      <ul className="divide-y divide-border" aria-label="Pacotes">
        {SERVICE_CATEGORIES.map((category) => {
          const group = (packages ?? []).filter((p) => (p.category ?? 'web') === category);
          if (!group.length) return null;
          const CategoryIcon = CATEGORY_ICONS[category];
          return [
            <li
              key={`h-${category}`}
              className="flex items-center gap-1.5 bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
            >
              <CategoryIcon className="h-3.5 w-3.5" aria-hidden />
              {SERVICE_CATEGORY_LABELS[category]}
            </li>,
            ...group.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {p.service ? <ServiceIcon service={p.service} className="text-muted" /> : null}
                    {p.name}
                    {p.recommended ? (
                      <Badge tone="accent">
                        <Star className="h-3 w-3" aria-hidden /> Recomendado
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    <span className="tabular">{formatCurrency(p.price)}</span> · {p.features.length} pontos
                    {p.delivery_days ? ` · ${p.delivery_days} dias` : ''}
                    {p.service ? ` · ${serviceLabel(p.service)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(toDraft(p))} aria-label={`Editar ${p.name}`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(p)} aria-label={`Apagar ${p.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            )),
          ];
        })}
      </ul>

      <form onSubmit={saveTexts} className="grid gap-3 border-t border-border p-4 md:grid-cols-2" noValidate>
        <Field label="Validade (dias)">
          <Input type="number" min={1} max={365} value={validity} onChange={(e) => setValidity(e.target.value)} />
        </Field>
        <Field label="Nota de IVA" hint="Ex.: “IVA isento ao abrigo do art. 53.º do CIVA”.">
          <Input value={tax} onChange={(e) => setTax(e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Condições de pagamento">
            <Input value={payment} onChange={(e) => setPayment(e.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Próximos passos (fim do PDF)">
            <Textarea rows={3} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end md:col-span-2">
          <Button type="submit" loading={saving}>
            Guardar textos
          </Button>
        </div>
      </form>

      <div className="flex items-start gap-2 border-t border-border p-4 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
        <p>
          <span className="font-medium">Gerador de emails com IA:</span>{' '}
          {settings.ai_configured ? (
            <Badge tone="success">Ativo</Badge>
          ) : (
            <span className="text-muted">
              inativo — define <code>ANTHROPIC_API_KEY</code> no servidor (chave em console.anthropic.com, ver README).
            </span>
          )}
        </p>
      </div>

      <PackageDialog draft={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
