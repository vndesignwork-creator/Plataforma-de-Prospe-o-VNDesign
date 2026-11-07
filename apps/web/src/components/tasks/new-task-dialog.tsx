'use client';

/**
 * "Nova tarefa" na página Tarefas: título, o lead ou projeto (opcional, com
 * pesquisa), prazo e responsável — sem ter de abrir a ficha. Sem lead, fica uma
 * tarefa solta (só aqui e em "Hoje").
 */
import { TASK_REPEATS, TASK_REPEAT_LABELS, TASK_TITLE_MAX, formatDate, normalizeText, parseTaskPhrase, todayIso, type Lead, type TaskRepeat } from '@vndesign/core';
import { BriefcaseBusiness, Search, Sparkles, Users } from 'lucide-react';
import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { DictateButton } from '@/components/ui/dictate-button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateTasks, useLeads, useMe, useTeamNames } from '@/lib/queries';
import { localInputToIso } from '@/lib/local-datetime';
import { cn } from '@/lib/utils';
import { DuePicker } from './tasks-card';
import { LeadTitle } from '@/components/leads/lead-title';

type Picked = Pick<Lead, 'id' | 'number' | 'company_name' | 'project_title' | 'status'>;

/** Procura o lead ou projeto da tarefa (pelo nome ou número). */
function LeadPicker({ value, onChange }: { value: Picked | null; onChange: (lead: Picked | null) => void }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const { data, isFetching } = useLeads({ q: deferred || undefined, limit: 8 });
  const leads = data?.data ?? [];

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
        <LeadLabel lead={value} />
        <button type="button" onClick={() => onChange(null)} className="ml-auto shrink-0 text-xs text-muted hover:text-fg hover:underline">
          Mudar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome da empresa, projeto ou n.º…"
          aria-label="Procurar o lead ou projeto"
          className="pl-9"
        />
      </div>
      <ul
        role="listbox"
        aria-label="Leads e projetos encontrados"
        className={cn('max-h-56 overflow-y-auto rounded-lg border border-border', isFetching && 'opacity-70')}
      >
        {leads.length ? (
          leads.map((l) => (
            <li key={l.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => onChange(l)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                <LeadLabel lead={l} />
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-2 text-sm text-muted">{data ? 'Nenhum lead encontrado.' : 'A procurar…'}</li>
        )}
      </ul>
      <p className="text-xs text-muted">Sem escolher nenhum, a tarefa fica solta (não pertence a nenhum lead).</p>
    </div>
  );
}

/** O lead que a frase parece referir ("Ligar à Clínica Sorriso…", "Proposta #12…"). */
function useLeadFromHint(hint: string | null, enabled: boolean): Picked | null {
  const byNumber = hint?.startsWith('#') ? Number(hint.slice(1)) : null;
  const q = useDeferredValue(enabled && hint ? (byNumber ? String(byNumber) : hint) : '');
  const { data } = useLeads({ q: q || undefined, limit: 5 }, !!q);
  if (!q || !data?.data.length) return null;
  if (byNumber) return data.data.find((l) => l.number === byNumber) ?? null;
  const wanted = normalizeText(hint) ?? '';
  // Só se o nome bater (não sugere um lead qualquer que tenha a palavra).
  return (
    data.data.find((l) => {
      const name = normalizeText(l.company_name) ?? '';
      return !!wanted && !!name && (name.includes(wanted) || wanted.includes(name));
    }) ?? null
  );
}

function LeadLabel({ lead }: { lead: Picked }) {
  const project = lead.status === 'cliente';
  const Icon = project ? BriefcaseBusiness : Users;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="truncate">
        <span className="text-muted tabular">#{lead.number}</span> <LeadTitle lead={lead} />
      </span>
      {project ? <span className="shrink-0 rounded bg-success/15 px-1.5 text-xs text-success">Projeto</span> : null}
    </span>
  );
}

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const { data: me } = useMe();
  const { data: team } = useTeamNames();
  const hasTeam = (team?.length ?? 0) > 1;
  const invalidate = useInvalidateTasks();
  const [today] = useState(() => todayIso());
  const [title, setTitle] = useState('');
  const [lead, setLead] = useState<Picked | null>(null);
  const [due, setDue] = useState('');
  const [repeat, setRepeat] = useState<TaskRepeat | ''>('');
  const [picking, setPicking] = useState(false);
  // Com equipa, a tarefa é de quem a cria (pode dar-se a outra pessoa).
  const [assignee, setAssignee] = useState<string | null>(null);
  const assigned = assignee ?? (hasTeam ? (me?.user.id ?? '') : '');
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [saving, setSaving] = useState(false);
  // Escrever como se fala: "Ligar à Clínica Sorriso sexta às 10h" → prazo, lembrete e lead.
  const [smart, setSmart] = useState(true);
  const parsed = useMemo(() => parseTaskPhrase(title, today), [title, today]);
  const recognized = smart && parsed.matched.length > 0;
  const suggested = useLeadFromHint(parsed.leadHint, smart && !lead);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { title: title.trim() ? undefined : 'Escreve a tarefa.' };
    setErrors(next);
    if (next.title) return;
    setSaving(true);
    // A data escolhida à mão ganha à do texto.
    const dueOn = due || (recognized ? parsed.due_on : null) || null;
    const remindAt = recognized && parsed.time && dueOn ? localInputToIso(`${dueOn}T${parsed.time}`) : null;
    // A repetição escolhida ganha à do texto ("todas as segundas").
    const repeatValue = repeat || (recognized ? parsed.repeat : null) || null;
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          title: recognized ? parsed.title : title.trim(),
          lead_id: lead?.id ?? null,
          due_on: dueOn,
          remind_at: remindAt,
          ...(repeatValue ? { repeat: repeatValue } : {}),
          ...(hasTeam ? { assigned_to: assigned || null } : {}),
        },
      });
      const when = dueOn ? `, para ${formatDate(dueOn)}${remindAt ? ` às ${parsed.time}` : ''}` : '';
      const repeats = repeatValue ? ` Repete-se: ${TASK_REPEAT_LABELS[repeatValue].toLowerCase()}.` : '';
      toast.success(lead ? `Tarefa criada em ${lead.company_name}${when}.${repeats}` : `Tarefa criada (sem lead)${when}.${repeats}`);
      invalidate(lead?.id ?? null);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Nova tarefa"
      description="Com um lead ou projeto, fica também na ficha dele (cartão Tarefas). Sem lead, fica só aqui e em “Hoje”."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-task" loading={saving}>
            Criar tarefa
          </Button>
        </>
      }
    >
      <form id="new-task" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Field label="Tarefa" error={errors.title} hint={recognized ? undefined : 'Podes escrever como falas: “Ligar à Clínica Sorriso sexta às 10h”.'}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Enviar proposta revista amanhã às 10h" maxLength={TASK_TITLE_MAX} autoFocus />
          </Field>
          <DictateButton value={title} onChange={setTitle} max={TASK_TITLE_MAX} className="self-end" />
          {recognized ? (
            <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-text">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Fica: <strong className="font-semibold">“{parsed.title}”</strong>
                {parsed.due_on && !due ? <> · 📅 {formatDate(parsed.due_on)}</> : null}
                {parsed.time && (due || parsed.due_on) ? <> · 🔔 {parsed.time}</> : null}
                {parsed.repeat && !repeat ? <> · 🔁 {TASK_REPEAT_LABELS[parsed.repeat]}</> : null}
              </span>
              <button type="button" onClick={() => setSmart(false)} className="ml-auto font-medium underline">
                Não usar
              </button>
            </p>
          ) : !smart && parsed.matched.length ? (
            <button type="button" onClick={() => setSmart(true)} className="self-start text-xs text-muted underline">
              Usar a data e a hora do texto
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Lead ou projeto <span className="font-normal text-muted">(opcional)</span>
          </span>
          {!lead && suggested ? (
            <p className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm">
              <span className="text-muted">É para</span>
              <LeadLabel lead={suggested} />
              <button type="button" onClick={() => setLead(suggested)} className="ml-auto text-sm font-medium text-accent-text hover:underline">
                Associar
              </button>
            </p>
          ) : null}
          <LeadPicker value={lead} onChange={setLead} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Prazo</span>
            <div className="flex flex-wrap items-center gap-2">
              <DuePicker value={due} today={today} onChange={setDue} onCustom={() => setPicking(true)} />
              {picking ? <DateInput value={due} onChange={setDue} aria-label="Data do prazo" className="w-40" /> : null}
            </div>
          </div>
          <Field label="Repetir" className="min-w-40">
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value as TaskRepeat | '')}>
              <option value="">Não se repete</option>
              {TASK_REPEATS.map((r) => (
                <option key={r} value={r}>
                  {TASK_REPEAT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          {hasTeam ? (
            <Field label="Responsável" className="min-w-40 flex-1">
              <Select value={assigned} onChange={(e) => setAssignee(e.target.value)}>
                {(team ?? []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                    {m.user_id === me?.user.id ? ' (tu)' : ''}
                  </option>
                ))}
                <option value="">Ninguém</option>
              </Select>
            </Field>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
