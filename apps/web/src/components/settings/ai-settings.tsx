'use client';

/**
 * Definições → Inteligência artificial: chaves de vários fornecedores (Claude,
 * ChatGPT, OpenRouter, compatíveis) e qual usar no email com IA e no gerador de leads.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AI_PROVIDER_KINDS,
  AI_PROVIDER_META,
  type AiFeatureSetting,
  type AiProvider,
  type AiProviderKind,
  type AiProviderTestResult,
} from '@vndesign/core';
import { CheckCircle2, Edit3, KeyRound, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useMe, useSettings } from '@/lib/queries';

const DEFAULT_MODELS = { email: 'claude-opus-5-5', lead_generation: 'claude-sonnet-5-5' } as const;

function useAiProviders() {
  return useQuery({ queryKey: ['ai-providers'], queryFn: () => api<{ data: AiProvider[] }>('/ai-providers').then((r) => r.data) });
}

interface Draft {
  id: string | null;
  kind: AiProviderKind;
  label: string;
  api_key: string;
  base_url: string;
}

function ProviderDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const meta = AI_PROVIDER_META[form.kind];

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const body = form.id
        ? { label: form.label || undefined, api_key: form.api_key || undefined, base_url: form.kind === 'custom' ? form.base_url : undefined }
        : { kind: form.kind, label: form.label || undefined, api_key: form.api_key, base_url: form.kind === 'custom' ? form.base_url : null };
      await api(form.id ? `/ai-providers/${form.id}` : '/ai-providers', { method: form.id ? 'PATCH' : 'POST', body });
      toast.success(form.id ? 'Fornecedor guardado.' : 'Chave guardada.');
      await qc.invalidateQueries({ queryKey: ['ai-providers'] });
      await qc.invalidateQueries({ queryKey: ['settings'] });
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
      title={form.id ? 'Editar fornecedor' : 'Juntar chave de IA'}
      className="max-w-lg"
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
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <Field label="Fornecedor" error={errors.kind?.[0]}>
          <Select value={form.kind} disabled={!!form.id} onChange={(e) => setForm({ ...form, kind: e.target.value as AiProviderKind })}>
            {AI_PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {AI_PROVIDER_META[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome (opcional)" error={errors.label?.[0]} hint={`Por omissão: “${meta.label}”.`}>
          <Input value={form.label} maxLength={60} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        {form.kind === 'custom' ? (
          <Field label="Endereço da API" required error={errors.base_url?.[0]} hint="Ex.: https://api.groq.com/openai/v1 ou https://api.mistral.ai/v1">
            <Input type="url" inputMode="url" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
          </Field>
        ) : null}
        <Field
          label={form.id ? 'Nova chave (opcional)' : 'Chave da API'}
          required={!form.id}
          error={errors.api_key?.[0]}
          hint={form.id ? 'Deixa vazio para manter a chave atual.' : meta.keyHelp}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          />
        </Field>
        <p className="text-xs text-muted">
          A chave fica guardada cifrada e nunca volta a aparecer — só os últimos 4 carateres.
          {meta.webSearch ? ' Este fornecedor pode ser usado no gerador de leads (pesquisa na internet).' : ' Este fornecedor não pesquisa na internet: serve para o email com IA.'}
        </p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function FeatureRow({
  title,
  description,
  feature,
  setting,
  providers,
  models,
  onLoadModels,
  canEdit,
}: {
  title: string;
  description: string;
  feature: 'email' | 'lead_generation';
  setting: AiFeatureSetting;
  providers: AiProvider[];
  models: Record<string, string[]>;
  onLoadModels: (id: string) => Promise<void>;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(setting.provider);
  const [model, setModel] = useState(setting.model ?? '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const usable = providers.filter((p) => feature === 'email' || p.web_search);
  const current = providers.find((p) => p.id === provider);
  const dirty = provider !== setting.provider || (model.trim() || null) !== (setting.model ?? null);
  const listId = `modelos-${feature}`;

  async function save() {
    setSaving(true);
    try {
      await api('/settings', { method: 'PATCH', body: { ai: { [feature]: { provider, model: model.trim() || null } } } });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`${title}: ${current?.label ?? 'fornecedor'} guardado.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={title} className="grid gap-3 border-t border-border p-4 first:border-t-0 md:grid-cols-2">
      <div className="md:col-span-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <Field label="Fornecedor">
        <Select
          value={provider}
          disabled={!canEdit}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel('');
          }}
        >
          {!usable.some((p) => p.id === provider) ? <option value={provider}>(fornecedor apagado)</option> : null}
          {usable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Modelo"
        hint={
          current?.kind === 'anthropic'
            ? `Vazio = ${DEFAULT_MODELS[feature]}.`
            : `Ex.: ${current ? AI_PROVIDER_META[current.kind].modelExample : '—'}. “Ver modelos” mostra a lista do fornecedor.`
        }
      >
        <Input
          list={listId}
          value={model}
          disabled={!canEdit}
          placeholder={current?.kind === 'anthropic' ? DEFAULT_MODELS[feature] : current ? AI_PROVIDER_META[current.kind].modelExample : ''}
          onChange={(e) => setModel(e.target.value)}
        />
      </Field>
      <datalist id={listId}>
        {(models[provider] ?? []).map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              await onLoadModels(provider);
              setLoading(false);
            }}
          >
            Ver modelos
          </Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
            Guardar
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function AiSettings() {
  const qc = useQueryClient();
  const { data: providers, isLoading } = useAiProviders();
  const { data: settings } = useSettings();
  const { data: me } = useMe();
  const canEdit = me ? me.role !== 'member' : false;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiProvider | null>(null);
  const [tests, setTests] = useState<Record<string, AiProviderTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const models = Object.fromEntries(Object.entries(tests).map(([id, t]) => [id, t.models]));

  async function test(id: string, quiet = false) {
    setTesting(id);
    try {
      const { data } = await api<{ data: AiProviderTestResult }>(`/ai-providers/${id}/test`, { method: 'POST' });
      setTests((t) => ({ ...t, [id]: data }));
      if (!quiet) (data.ok ? toast.success : toast.error)(data.message);
      else if (!data.ok) toast.error(data.message);
      else if (!data.models.length) toast.info('O fornecedor não devolveu a lista de modelos: escreve o nome do modelo.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTesting(null);
    }
  }

  async function remove(p: AiProvider) {
    try {
      await api(`/ai-providers/${p.id}`, { method: 'DELETE' });
      toast.success('Fornecedor apagado.');
      setConfirmDelete(null);
      await qc.invalidateQueries({ queryKey: ['ai-providers'] });
      await qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (isLoading || !settings || !providers) return <Skeleton className="h-96" />;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Chaves de IA"
          description="Junta as tuas chaves da Anthropic (Claude), OpenAI (ChatGPT), OpenRouter ou de outro serviço compatível. Cada pedido gasta créditos da conta do fornecedor."
          actions={
            canEdit ? (
              <Button size="sm" onClick={() => setDraft({ id: null, kind: 'openai', label: '', api_key: '', base_url: '' })}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Juntar chave
              </Button>
            ) : null
          }
        />
        {providers.length ? (
          <ul className="divide-y divide-border" aria-label="Fornecedores de IA">
            {providers.map((p) => {
              const result = tests[p.id];
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="break-words">{p.label}</span>
                      {p.built_in ? <Badge>Servidor</Badge> : null}
                      {p.web_search ? <Badge tone="accent">Pesquisa na internet</Badge> : null}
                    </p>
                    <p className="text-sm text-muted">
                      {AI_PROVIDER_META[p.kind].label} · chave {p.key_hint}
                      {p.base_url ? ` · ${p.base_url}` : ''}
                    </p>
                    {result ? (
                      <p className={result.ok ? 'mt-1 flex items-center gap-1 text-sm text-success' : 'mt-1 flex items-center gap-1 text-sm text-danger'}>
                        {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
                        {result.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="ml-auto flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="outline" loading={testing === p.id} onClick={() => test(p.id)}>
                      Testar
                    </Button>
                    {canEdit && !p.built_in ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${p.label}`}
                          onClick={() => setDraft({ id: p.id, kind: p.kind, label: p.label, api_key: '', base_url: p.base_url ?? '' })}
                        >
                          <Edit3 className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Apagar ${p.label}`} onClick={() => setConfirmDelete(p)}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="p-4 text-center text-sm text-muted">Ainda não há chaves. Junta uma para usar o email com IA e o gerador de leads.</p>
        )}
      </Card>

      {providers.length ? (
        <Card>
          <CardHeader title="Onde usar" description="Escolhe o fornecedor e o modelo de cada função." />
          <FeatureRow
            key={`email-${settings.ai.email.provider}-${settings.ai.email.model}`}
            title="Email com IA"
            description="Rascunhos de email na ficha do lead."
            feature="email"
            setting={settings.ai.email}
            providers={providers}
            models={models}
            onLoadModels={(id) => test(id, true)}
            canEdit={canEdit}
          />
          <FeatureRow
            key={`lead-${settings.ai.lead_generation.provider}-${settings.ai.lead_generation.model}`}
            title="Gerador de leads"
            description="Precisa de pesquisa na internet: Claude, OpenAI ou OpenRouter."
            feature="lead_generation"
            setting={settings.ai.lead_generation}
            providers={providers}
            models={models}
            onLoadModels={(id) => test(id, true)}
            canEdit={canEdit}
          />
        </Card>
      ) : null}

      {draft ? <ProviderDialog draft={draft} onClose={() => setDraft(null)} /> : null}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => (!open ? setConfirmDelete(null) : undefined)}
        title="Apagar este fornecedor?"
        description={confirmDelete ? `A chave de “${confirmDelete.label}” é apagada. As funções que o usavam voltam à chave do servidor.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>
              Apagar
            </Button>
          </>
        }
      />
    </div>
  );
}
