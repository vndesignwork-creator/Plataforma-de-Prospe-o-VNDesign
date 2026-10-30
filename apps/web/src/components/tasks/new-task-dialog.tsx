'use client';

/**
 * "Nova tarefa" na página Tarefas: título, o lead ou projeto (com pesquisa),
 * prazo e responsável — sem ter de abrir a ficha.
 */
import { formatDate, todayIso, type Lead } from '@vndesign/core';
import { BriefcaseBusiness, Search, Users } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useInvalidateTasks, useLeads, useMe, useTeamNames } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { DuePicker } from './tasks-card';

type Picked = Pick<Lead, 'id' | 'number' | 'company_name' | 'project_title' | 'status'>;

/** Procura o lead ou projeto da tarefa (pelo nome ou número). */
function LeadPicker({ value, onChange, error }: { value: Picked | null; onChange: (lead: Picked | null) => void; error?: string }) {
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
          aria-invalid={error ? true : undefined}
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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function LeadLabel({ lead }: { lead: Picked }) {
  const project = lead.status === 'cliente';
  const Icon = project ? BriefcaseBusiness : Users;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="truncate">
        <span className="text-muted tabular">#{lead.number}</span> {lead.company_name}
        {lead.project_title ? <span className="text-muted"> · {lead.project_title}</span> : null}
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
  const [picking, setPicking] = useState(false);
  // Com equipa, a tarefa é de quem a cria (pode dar-se a outra pessoa).
  const [assignee, setAssignee] = useState<string | null>(null);
  const assigned = assignee ?? (hasTeam ? (me?.user.id ?? '') : '');
  const [errors, setErrors] = useState<{ title?: string; lead?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      title: title.trim() ? undefined : 'Escreve a tarefa.',
      lead: lead ? undefined : 'Escolhe o lead ou projeto.',
    };
    setErrors(next);
    if (next.title || next.lead || !lead) return;
    setSaving(true);
    try {
      await api(`/leads/${lead.id}/tasks`, {
        method: 'POST',
        body: {
          title: title.trim(),
          due_on: due || null,
          ...(hasTeam ? { assigned_to: assigned || null } : {}),
        },
      });
      toast.success(`Tarefa criada em ${lead.company_name}${due ? `, para ${formatDate(due)}` : ''}.`);
      invalidate(lead.id);
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
      description="Fica na ficha do lead ou projeto (cartão Tarefas) e aqui, pelo prazo."
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
        <Field label="Tarefa" error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Enviar proposta revista" maxLength={300} autoFocus />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Lead ou projeto</span>
          <LeadPicker value={lead} onChange={setLead} error={errors.lead} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Prazo</span>
            <div className="flex flex-wrap items-center gap-2">
              <DuePicker value={due} today={today} onChange={setDue} onCustom={() => setPicking(true)} />
              {picking ? <DateInput value={due} onChange={setDue} aria-label="Data do prazo" className="w-40" /> : null}
            </div>
          </div>
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
