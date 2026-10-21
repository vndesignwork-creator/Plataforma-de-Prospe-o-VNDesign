'use client';

/**
 * Pesquisas automáticas: a mesma pesquisa do gerador, repetida sozinha uma vez
 * por semana (dia e hora de Lisboa). Cada uma tem o seu interruptor
 * ativar/desativar; no fim chega uma notificação e um email com o resumo.
 */
import { WEEKDAY_LABELS, describeWeeklyRun, type LeadGenerationSchedule } from '@vndesign/core';
import { AlertTriangle, CalendarClock, MoreHorizontal, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api-client';
import { formatReminder } from '@/lib/local-datetime';
import {
  useDeleteLeadGenerationSchedule,
  useLeadGenerationSchedules,
  useRunLeadGenerationSchedule,
  useSaveLeadGenerationSchedule,
  useSectors,
} from '@/lib/queries';
import { EMPTY_DRAFT, SearchFields, draftToRequest, type SearchDraft } from './search-fields';

/** "28/10 às 09:00" (hora de Lisboa). */
const when = (iso: string) => formatReminder(iso).replace(/,? (\d{2}:\d{2})$/, ' às $1');

const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Sem passagem do cron há mais do que isto, o agendador provavelmente não está ligado. */
const CRON_STALE_MS = 60 * 60_000;

const scheduleToDraft = (s: LeadGenerationSchedule): SearchDraft => ({
  query: s.query,
  city: s.city ?? '',
  sectorId: s.sector_id ?? '',
  services: s.services,
  count: s.max_results,
});

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editar esta; sem ela, cria uma nova. */
  schedule?: LeadGenerationSchedule | null;
  /** Pesquisa já preenchida (botão "Repetir todas as semanas"). */
  initial?: SearchDraft;
}) {
  const save = useSaveLeadGenerationSchedule();
  const [draft, setDraft] = useState<SearchDraft>(() => (schedule ? scheduleToDraft(schedule) : (initial ?? EMPTY_DRAFT)));
  const [weekday, setWeekday] = useState(schedule?.weekday ?? 1);
  const [hour, setHour] = useState(schedule?.hour ?? 8);
  const [autoAdd, setAutoAdd] = useState(schedule?.auto_add ?? false);
  const [audit, setAudit] = useState(schedule?.audit ?? true);
  const [error, setError] = useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.query.trim().length < 3) {
      setError('Descreve que empresas procuras.');
      return;
    }
    setError(undefined);
    try {
      const body = { ...draftToRequest(draft), weekday, hour, auto_add: autoAdd, audit };
      const saved = await save.mutateAsync(schedule ? { id: schedule.id, body } : { body: { ...body, enabled: true } });
      toast.success(
        schedule
          ? 'Pesquisa automática guardada.'
          : `Pesquisa automática criada. A primeira corre ${saved.next_run_at ? `a ${when(saved.next_run_at)}` : 'na próxima semana'}.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={schedule ? 'Editar pesquisa automática' : 'Nova pesquisa automática'}
      description="Corre sozinha uma vez por semana. No fim recebes uma notificação e um email com as empresas novas."
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="schedule-form" loading={save.isPending}>
            {schedule ? 'Guardar' : 'Criar pesquisa automática'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
        <SearchFields value={draft} onChange={setDraft} error={error} />
        <Field label="Dia da semana">
          <Select value={String(weekday)} onChange={(e) => setWeekday(Number(e.target.value))}>
            {Object.entries(WEEKDAY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hora" hint="Hora de Portugal continental.">
          <Select value={String(hour)} onChange={(e) => setHour(Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm md:col-span-2">
          <legend className="px-1 text-sm font-medium">Quando terminar</legend>
          <label className="inline-flex items-start gap-2">
            <input type="radio" name="auto-add" className="mt-0.5 h-4 w-4" checked={!autoAdd} onChange={() => setAutoAdd(false)} />
            <span>
              Guardar a lista para eu rever
              <span className="block text-xs text-muted">Escolhes quais entram como leads (recomendado).</span>
            </span>
          </label>
          <label className="inline-flex items-start gap-2">
            <input type="radio" name="auto-add" className="mt-0.5 h-4 w-4" checked={autoAdd} onChange={() => setAutoAdd(true)} />
            <span>
              Adicionar logo as empresas novas como leads
              <span className="block text-xs text-muted">Duplicados e empresas da lista “não contactar” ficam sempre de fora.</span>
            </span>
          </label>
          {autoAdd ? (
            <label className="ml-6 inline-flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={audit} onChange={(e) => setAudit(e.target.checked)} />
              Analisar os sites dos leads adicionados
            </label>
          ) : null}
        </fieldset>
        <p className="text-xs text-muted md:col-span-2">
          Cada pesquisa gasta créditos do fornecedor de IA (cerca de 0,20 $ a 1,50 $), uma vez por semana.
        </p>
      </form>
    </Dialog>
  );
}

function CronStatus({ schedules }: { schedules: LeadGenerationSchedule[] }) {
  // Hora fixa ao abrir a página (a lista volta a ser pedida ao voltar à página).
  const [now] = useState(() => Date.now());
  const enabled = schedules.filter((s) => s.enabled);
  if (!enabled.length) return null;
  const checked = Math.max(0, ...enabled.map((s) => (s.checked_at ? new Date(s.checked_at).getTime() : 0)));
  // Acabada de criar: o cron ainda não teve tempo de passar.
  const newest = Math.max(...enabled.map((s) => new Date(s.created_at).getTime()));
  if (checked && now - checked < CRON_STALE_MS) {
    return <p className="px-4 pb-3 text-xs text-muted">Agendador ativo · última verificação às {when(new Date(checked).toISOString()).split(' ').pop()}.</p>;
  }
  if (!checked && now - newest < CRON_STALE_MS) return null;
  return (
    <p role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        O agendador não está a correr: as pesquisas automáticas só arrancam com o cron dos lembretes ligado na Hostinger (hPanel →
        Avançado → Cron Jobs, de 5 em 5 minutos). Entretanto podes usar “Correr agora”.
      </span>
    </p>
  );
}

function ScheduleRow({
  schedule,
  sectorName,
  onEdit,
  onOpenRun,
}: {
  schedule: LeadGenerationSchedule;
  sectorName: string | null;
  onEdit: () => void;
  onOpenRun: (id: string) => void;
}) {
  const save = useSaveLeadGenerationSchedule();
  const remove = useDeleteLeadGenerationSchedule();
  const run = useRunLeadGenerationSchedule();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const s = schedule;

  async function toggle(enabled: boolean) {
    try {
      const saved = await save.mutateAsync({ id: s.id, body: { enabled } });
      toast.success(
        enabled
          ? `Pesquisa automática ativada. Próxima: ${saved.next_run_at ? when(saved.next_run_at) : '—'}.`
          : 'Pesquisa automática desativada.',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function runNow() {
    try {
      const started = await run.mutateAsync(s.id);
      onOpenRun(started.id);
      toast.success('A pesquisar… o resultado aparece abaixo em 1 a 3 minutos.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Switch
        checked={s.enabled}
        onCheckedChange={toggle}
        disabled={save.isPending}
        label={`${s.enabled ? 'Desativar' : 'Ativar'} a pesquisa automática “${s.query}”`}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium break-words">{s.query}</p>
        <p className="text-sm text-muted">{[s.city, sectorName, `até ${s.max_results} empresas`].filter(Boolean).join(' · ')}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {describeWeeklyRun(s.weekday, s.hour)}
          </span>
          <span>{s.enabled && s.next_run_at ? `Próxima: ${when(s.next_run_at)}` : 'Desativada'}</span>
          <Badge tone={s.auto_add ? 'accent' : 'neutral'}>{s.auto_add ? 'Adiciona os leads sozinha' : 'Fica para rever'}</Badge>
        </p>
        {s.last_error ? (
          <p className="text-xs text-danger">Na última vez não arrancou: {s.last_error}</p>
        ) : s.last_run_id && s.last_run_at ? (
          <button type="button" onClick={() => onOpenRun(s.last_run_id!)} className="w-fit text-xs text-accent-text hover:underline">
            Ver a última pesquisa ({when(s.last_run_at)})
          </button>
        ) : null}
      </div>
      <DropdownRoot>
        <DropdownTrigger className={buttonClasses('ghost', 'sm')} aria-label={`Mais ações: ${s.query}`}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={runNow} disabled={run.isPending}>
            <Play className="h-4 w-4" aria-hidden /> Correr agora
          </DropdownItem>
          <DropdownItem onSelect={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden /> Editar
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Apagar
          </DropdownItem>
        </DropdownContent>
      </DropdownRoot>
      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Apagar a pesquisa automática?"
        description="Deixa de correr todas as semanas. As pesquisas já feitas e os leads criados ficam."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={async () => {
                try {
                  await remove.mutateAsync(s.id);
                  setConfirmDelete(false);
                  toast.success('Pesquisa automática apagada.');
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Apagar
            </Button>
          </>
        }
      />
    </li>
  );
}

export function SchedulesCard({ onOpenRun }: { onOpenRun: (id: string) => void }) {
  const { data: schedules, isLoading } = useLeadGenerationSchedules();
  const { data: sectors } = useSectors();
  // undefined = fechado; null = nova; uma pesquisa = editar.
  const [editing, setEditing] = useState<LeadGenerationSchedule | null | undefined>(undefined);
  const sectorName = (id: string | null) => sectors?.find((x) => x.id === id)?.name ?? null;

  return (
    <Card>
      <CardHeader
        title="Pesquisas automáticas"
        description="Repetem-se sozinhas uma vez por semana. Liga ou desliga cada uma no interruptor."
        actions={
          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Nova
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="m-4 h-16" />
      ) : schedules?.length ? (
        <>
          <ul className="divide-y divide-border" aria-label="Pesquisas automáticas">
            {schedules.map((s) => (
              <ScheduleRow key={s.id} schedule={s} sectorName={sectorName(s.sector_id)} onEdit={() => setEditing(s)} onOpenRun={onOpenRun} />
            ))}
          </ul>
          <CronStatus schedules={schedules} />
        </>
      ) : (
        <p className="p-4 text-center text-sm text-muted">
          Ainda não tens pesquisas automáticas. Preenche a pesquisa acima e carrega em “Repetir todas as semanas”, ou em “Nova”.
        </p>
      )}
      {editing !== undefined ? (
        <ScheduleDialog key={editing?.id ?? 'nova'} open onOpenChange={(open) => !open && setEditing(undefined)} schedule={editing} />
      ) : null}
    </Card>
  );
}
