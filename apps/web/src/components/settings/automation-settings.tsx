'use client';

/**
 * Definições → Regras automáticas: "se o lead cumpre isto, faz aquilo". Cada regra
 * aplica-se uma vez a cada lead, ao criar/editar o lead e (as de "parado há N dias")
 * no cron diário. Aqui: ideias prontas, editor, pré-visualização e "Aplicar agora".
 */
import {
  ACTION_LABELS,
  CONDITION_LABELS,
  LEAD_CHANNELS,
  LEAD_CHANNEL_META,
  LEAD_STATUSES,
  LEAD_STATUS_META,
  describeAction,
  describeCondition,
  formatDateTime,
  type AutomationRule,
  type AutomationRuleCreate,
  type LeadStatus,
  type RuleAction,
  type RuleActionType,
  type RuleCondition,
  type RuleConditionType,
} from '@vndesign/core';
import { Pencil, Play, Plus, Trash2, Workflow, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLeadTags } from '@/components/leads/tags';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/hooks';
import { useAutomationRules, useDeleteAutomationRule, useRole, useRunAutomationRule, useSaveAutomationRule, useSectors, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';

const CONDITION_TYPES = Object.keys(CONDITION_LABELS) as RuleConditionType[];
const ACTION_TYPES = Object.keys(ACTION_LABELS) as RuleActionType[];

function defaultCondition(type: RuleConditionType): RuleCondition {
  switch (type) {
    case 'status_in':
      return { type, values: ['contactado'] };
    case 'sector_in':
      return { type, values: [] };
    case 'city_is':
    case 'has_tag':
    case 'not_tag':
      return { type, value: '' };
    case 'channel_is':
      return { type, value: 'email' };
    case 'idle_days':
      return { type, days: 21 };
    default:
      return { type } as RuleCondition;
  }
}

function defaultAction(type: RuleActionType): RuleAction {
  switch (type) {
    case 'add_tag':
    case 'remove_tag':
      return { type, value: '' };
    case 'set_status':
      return { type, value: 'em_pausa' };
    case 'assign_to':
      return { type, user_id: '' };
    case 'create_task':
      return { type, title: '', due_in_days: 0 };
    case 'set_next_action':
      return { type, text: '', in_days: 0 };
  }
}

/** Ideias prontas (abrem o editor já preenchido). */
const IDEAS: (AutomationRuleCreate & { hint: string })[] = [
  { name: 'Sem site', hint: 'Etiqueta os leads sem site (bons candidatos a um site novo).', enabled: true, conditions: [{ type: 'no_website' }], actions: [{ type: 'add_tag', value: 'Sem site' }] },
  {
    name: 'Sem resposta há 21 dias',
    hint: 'Contactados que não responderam em 3 semanas passam a Em pausa.',
    enabled: true,
    conditions: [{ type: 'status_in', values: ['contactado'] }, { type: 'idle_days', days: 21 }],
    actions: [{ type: 'set_status', value: 'em_pausa' }],
  },
  {
    name: 'Respondeu: responder hoje',
    hint: 'Quando um lead responde, cria a tarefa para lhe responder no mesmo dia.',
    enabled: true,
    conditions: [{ type: 'status_in', values: ['respondeu'] }],
    actions: [{ type: 'create_task', title: 'Responder ao lead', due_in_days: 0 }],
  },
  {
    name: 'Sem email: procurar contacto',
    hint: 'Leads sem email ganham a tarefa de procurar o contacto.',
    enabled: true,
    conditions: [{ type: 'no_email' }, { type: 'status_in', values: ['identificado'] }],
    actions: [{ type: 'create_task', title: 'Procurar o email', due_in_days: 1 }],
  },
];

function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={cn('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-muted hover:text-fg')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ConditionEditor({ c, onChange, tagsList }: { c: RuleCondition; onChange: (c: RuleCondition) => void; tagsList: string }) {
  const { data: sectors } = useSectors();
  switch (c.type) {
    case 'status_in':
      return (
        <Chips
          label="Fases"
          options={LEAD_STATUSES.map((s) => ({ id: s, label: LEAD_STATUS_META[s].label }))}
          value={c.values}
          onChange={(values) => onChange({ ...c, values: values as LeadStatus[] })}
        />
      );
    case 'sector_in':
      return <Chips label="Setores" options={(sectors ?? []).map((s) => ({ id: s.id, label: s.name }))} value={c.values} onChange={(values) => onChange({ ...c, values })} />;
    case 'city_is':
      return <Input aria-label="Cidade" value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })} placeholder="Ex.: Amadora" className="h-9" />;
    case 'channel_is':
      return (
        <Select aria-label="Canal" value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value as typeof c.value })} className="h-9">
          {LEAD_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {LEAD_CHANNEL_META[ch].label}
            </option>
          ))}
        </Select>
      );
    case 'has_tag':
    case 'not_tag':
      return <Input aria-label="Etiqueta" list={tagsList} value={c.value} onChange={(e) => onChange({ ...c, value: e.target.value })} placeholder="Ex.: Sem site" className="h-9" />;
    case 'idle_days':
      return (
        <span className="flex items-center gap-2 text-sm">
          <Input aria-label="Dias" type="number" min={1} max={365} value={c.days} onChange={(e) => onChange({ ...c, days: Number(e.target.value) || 1 })} className="h-9 w-20" />
          dias
        </span>
      );
    default:
      return null;
  }
}

function ActionEditor({ a, onChange, tagsList }: { a: RuleAction; onChange: (a: RuleAction) => void; tagsList: string }) {
  const { data: team } = useTeamNames();
  switch (a.type) {
    case 'add_tag':
    case 'remove_tag':
      return <Input aria-label="Etiqueta" list={tagsList} value={a.value} onChange={(e) => onChange({ ...a, value: e.target.value })} placeholder="Ex.: Sem site" className="h-9" />;
    case 'set_status':
      return (
        <Select aria-label="Fase" value={a.value} onChange={(e) => onChange({ ...a, value: e.target.value as LeadStatus })} className="h-9">
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_META[s].label}
            </option>
          ))}
        </Select>
      );
    case 'assign_to':
      return (
        <Select aria-label="Pessoa" value={a.user_id} onChange={(e) => onChange({ ...a, user_id: e.target.value })} className="h-9">
          <option value="">— Escolher —</option>
          {(team ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </Select>
      );
    case 'create_task':
    case 'set_next_action': {
      const text = a.type === 'create_task' ? a.title : a.text;
      const days = a.type === 'create_task' ? a.due_in_days : a.in_days;
      return (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            aria-label={a.type === 'create_task' ? 'Tarefa' : 'Próxima ação'}
            value={text}
            onChange={(e) => onChange(a.type === 'create_task' ? { ...a, title: e.target.value } : { ...a, text: e.target.value })}
            placeholder={a.type === 'create_task' ? 'Ex.: Ligar ao lead' : 'Ex.: Enviar follow-up'}
            className="h-9 min-w-0 flex-[1_1_12rem]"
          />
          para daqui a
          <Input
            aria-label="Dias"
            type="number"
            min={0}
            max={365}
            value={days}
            onChange={(e) => {
              const n = Math.max(0, Number(e.target.value) || 0);
              onChange(a.type === 'create_task' ? { ...a, due_in_days: n } : { ...a, in_days: n });
            }}
            className="h-9 w-20"
          />
          dias
        </span>
      );
    }
  }
}

function RuleDialog({ initial, onClose }: { initial: AutomationRule | (AutomationRuleCreate & { id?: undefined }); onClose: () => void }) {
  const save = useSaveAutomationRule();
  const run = useRunAutomationRule();
  const { data: tags } = useLeadTags();
  const [name, setName] = useState(initial.name);
  const [conditions, setConditions] = useState<RuleCondition[]>(initial.conditions);
  const [actions, setActions] = useState<RuleAction[]>(initial.actions);
  const [applyNow, setApplyNow] = useState(!initial.id);
  const [preview, setPreview] = useState<{ count: number; sample: { company_name: string }[] } | null>(null);
  const tagsList = 'automation-tags';
  const debounced = useDebouncedValue(JSON.stringify(conditions), 400);

  useEffect(() => {
    let cancelled = false;
    const parsed = JSON.parse(debounced) as RuleCondition[];
    if (!parsed.length) return;
    api<{ data: { count: number; sample: { company_name: string }[] } }>('/automation-rules/preview', { method: 'POST', body: { conditions: parsed } })
      .then((r) => !cancelled && setPreview(r.data))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  async function submit() {
    try {
      const saved = await save.mutateAsync({ id: initial.id, body: { name, conditions, actions, enabled: initial.enabled } });
      if (applyNow && saved.enabled) {
        const { applied } = await run.mutateAsync(saved.id);
        toast.success(applied ? `Regra guardada e aplicada a ${applied} lead${applied === 1 ? '' : 's'}.` : 'Regra guardada (nenhum lead a cumpre agora).');
      } else toast.success('Regra guardada.');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={initial.id ? 'Editar regra' : 'Nova regra'}
      description="Se o lead cumprir todas as condições, a plataforma faz as ações (uma vez por lead)."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending || run.isPending} disabled={!name.trim() || !conditions.length || !actions.length}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <datalist id={tagsList}>
          {(tags ?? []).map((t) => (
            <option key={t.tag} value={t.tag} />
          ))}
        </datalist>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nome da regra
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex.: Sem site" />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Se o lead…</legend>
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2 sm:flex-row sm:items-start">
              <Select
                aria-label={`Condição ${i + 1}`}
                value={c.type}
                onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? defaultCondition(e.target.value as RuleConditionType) : x)))}
                className="h-9 sm:w-56"
              >
                {CONDITION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONDITION_LABELS[t]}
                  </option>
                ))}
              </Select>
              <div className="min-w-0 flex-1">
                <ConditionEditor c={c} tagsList={tagsList} onChange={(next) => setConditions(conditions.map((x, j) => (j === i ? next : x)))} />
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9 self-end sm:self-start" onClick={() => setConditions(conditions.filter((_, j) => j !== i))} aria-label={`Tirar a condição ${i + 1}`}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="self-end" onClick={() => setConditions([...conditions, defaultCondition('no_website')])} disabled={conditions.length >= 10}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Condição
          </Button>
          {preview ? (
            <p role="status" className="text-xs text-muted">
              Hoje {preview.count === 1 ? 'cumpre isto 1 lead' : `cumprem isto ${preview.count} leads`}
              {preview.sample.length ? ` (ex.: ${preview.sample.slice(0, 3).map((s) => s.company_name).join(', ')})` : ''}.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">…então</legend>
          {actions.map((a, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2 sm:flex-row sm:items-start">
              <Select
                aria-label={`Ação ${i + 1}`}
                value={a.type}
                onChange={(e) => setActions(actions.map((x, j) => (j === i ? defaultAction(e.target.value as RuleActionType) : x)))}
                className="h-9 sm:w-56"
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTION_LABELS[t]}
                  </option>
                ))}
              </Select>
              <div className="min-w-0 flex-1">
                <ActionEditor a={a} tagsList={tagsList} onChange={(next) => setActions(actions.map((x, j) => (j === i ? next : x)))} />
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9 self-end sm:self-start" onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label={`Tirar a ação ${i + 1}`}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="self-end" onClick={() => setActions([...actions, defaultAction('add_tag')])} disabled={actions.length >= 10}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Ação
          </Button>
        </fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
          <span>
            Aplicar já aos leads que cumprem{preview ? ` (${preview.count})` : ''}
            <span className="block text-xs text-muted">Sem isto, a regra só atua nos leads novos ou quando forem editados.</span>
          </span>
        </label>
      </div>
    </Dialog>
  );
}

function RuleRow({ rule, onEdit, canEdit }: { rule: AutomationRule; onEdit: () => void; canEdit: boolean }) {
  const save = useSaveAutomationRule();
  const remove = useDeleteAutomationRule();
  const run = useRunAutomationRule();
  const { data: sectors } = useSectors();
  const { data: team } = useTeamNames();
  const lookups = useMemo(
    () => ({ sectors: new Map((sectors ?? []).map((s) => [s.id, s.name])), people: new Map((team ?? []).map((m) => [m.user_id, m.name])) }),
    [sectors, team],
  );
  return (
    <li className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start', !rule.enabled && 'opacity-70')}>
      <Switch
        checked={rule.enabled}
        onCheckedChange={(enabled) => save.mutate({ id: rule.id, body: { enabled } }, { onError: (e) => toast.error(errorMessage(e)) })}
        label={`${rule.enabled ? 'Desligar' : 'Ligar'} a regra ${rule.name}`}
        disabled={!canEdit}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{rule.name}</p>
        <p className="text-muted">
          <span className="font-medium text-fg">Se</span> {rule.conditions.map((c) => describeCondition(c, lookups).toLowerCase()).join(' e ')}{' '}
          <span className="font-medium text-fg">→</span> {rule.actions.map((a) => describeAction(a, lookups).toLowerCase()).join('; ')}.
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {rule.runs ? `Aplicada a ${rule.runs} lead${rule.runs === 1 ? '' : 's'}` : 'Ainda não se aplicou a nenhum lead'}
          {rule.last_run_at ? ` · última vez ${formatDateTime(rule.last_run_at)}` : ''}
        </p>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!rule.enabled}
            loading={run.isPending}
            onClick={() =>
              run.mutate(rule.id, {
                onSuccess: ({ applied }) => toast.success(applied ? `Aplicada a ${applied} lead${applied === 1 ? '' : 's'}.` : 'Nenhum lead novo cumpre a regra.'),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <Play className="h-3.5 w-3.5" aria-hidden /> Aplicar agora
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} aria-label={`Editar ${rule.name}`}>
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={`Apagar ${rule.name}`}
            onClick={() => {
              if (window.confirm(`Apagar a regra "${rule.name}"? O que já fez nos leads fica.`)) remove.mutate(rule.id, { onError: (e) => toast.error(errorMessage(e)) });
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function AutomationSettings() {
  const { data: rules, isLoading } = useAutomationRules();
  const role = useRole();
  const canEdit = role === 'owner' || role === 'admin';
  const [editing, setEditing] = useState<AutomationRule | (AutomationRuleCreate & { id?: undefined }) | null>(null);
  const unused = IDEAS.filter((idea) => !rules?.some((r) => r.name === idea.name));

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Regras automáticas"
          description="Se o lead cumpre as condições, a plataforma faz o resto: etiqueta, fase, responsável, tarefa ou próxima ação. Cada regra aplica-se uma vez a cada lead, ao criar ou editar o lead (e, as de “parado há N dias”, todas as manhãs)."
          actions={
            canEdit ? (
              <Button size="sm" onClick={() => setEditing({ name: '', enabled: true, conditions: [defaultCondition('no_website')], actions: [defaultAction('add_tag')] })}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Nova regra
              </Button>
            ) : null
          }
        />
        {isLoading ? (
          <Skeleton className="m-4 h-16" />
        ) : rules?.length ? (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} canEdit={canEdit} onEdit={() => setEditing(r)} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Ainda sem regras">Começa por uma das ideias abaixo ou cria a tua.</EmptyState>
        )}
      </Card>

      {canEdit && unused.length ? (
        <Card>
          <CardHeader title="Ideias" description="Abre já preenchida: revês e guardas." />
          <ul className="grid gap-2 p-4 sm:grid-cols-2">
            {unused.map(({ hint, ...idea }) => (
              <li key={idea.name}>
                <button
                  type="button"
                  onClick={() => setEditing(idea)}
                  className="flex h-full w-full items-start gap-2 rounded-lg border border-border p-3 text-left text-sm hover:border-accent hover:bg-surface-2"
                >
                  <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
                  <span>
                    <span className="block font-medium">{idea.name}</span>
                    <span className="text-xs text-muted">{hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editing ? <RuleDialog key={editing.id ?? editing.name} initial={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
