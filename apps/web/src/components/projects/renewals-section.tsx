'use client';

/**
 * Renovações e avenças do cliente (domínio, alojamento, manutenção…): a próxima data,
 * "Renovado" (passa à seguinte e regista o pagamento), email pronto a lembrar o cliente
 * e o aviso uns dias antes (tarefa + sino, pelo cron diário).
 */
import {
  RENEWAL_KINDS,
  RENEWAL_KIND_DEFAULT_TITLE,
  RENEWAL_KIND_LABELS,
  RENEWAL_PERIODS,
  RENEWAL_PERIOD_LABELS,
  daysUntil,
  formatCurrency,
  formatDate,
  renewalEmail,
  renewalMonthly,
  renewalPrice,
  todayIso,
  type Lead,
  type Renewal,
  type RenewalKind,
  type RenewalPeriod,
} from '@vndesign/core';
import { Check, Globe, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Server, Trash2, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { Button, buttonClasses } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useDeleteRenewal, useRenewals, useRenewRenewal, useSaveRenewal, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

const KIND_ICON: Record<RenewalKind, typeof Globe> = { domain: Globe, hosting: Server, maintenance: Wrench, other: Repeat };
const REMIND_OPTIONS = [7, 14, 30, 60] as const;

type Form = { kind: RenewalKind; title: string; amount: string; period: RenewalPeriod; next_due_on: string; remind_days: number };
const emptyForm = (): Form => ({ kind: 'domain', title: RENEWAL_KIND_DEFAULT_TITLE.domain, amount: '', period: 'yearly', next_due_on: '', remind_days: 30 });
const toForm = (r: Renewal): Form => ({
  kind: r.kind,
  title: r.title,
  amount: String(r.amount).replace('.', ','),
  period: r.period,
  next_due_on: r.next_due_on,
  remind_days: r.remind_days,
});

/** "renova a 12/03/2027 · faltam 30 dias" (ou em atraso). */
function DueLine({ r }: { r: Renewal }) {
  if (!r.active) return <span className="text-muted">Em pausa (sem avisos)</span>;
  const days = daysUntil(r.next_due_on, todayIso());
  const when = formatDate(r.next_due_on);
  if (days < 0) return <span className="font-medium text-danger">Em atraso desde {when}</span>;
  if (days === 0) return <span className="font-medium text-warning">Renova hoje</span>;
  return (
    <span className={days <= r.remind_days ? 'font-medium text-warning' : 'text-muted'}>
      Renova a {when} · {days === 1 ? 'falta 1 dia' : `faltam ${days} dias`}
    </span>
  );
}

function RenewalForm({ lead, renewal, onDone }: { lead: Lead; renewal?: Renewal; onDone: () => void }) {
  const save = useSaveRenewal(lead.id);
  const [form, setForm] = useState<Form>(() => (renewal ? toForm(renewal) : emptyForm()));
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync({
        id: renewal?.id,
        body: { ...form, amount: Number(form.amount.replace(/\s|€/g, '').replace(',', '.') || 0) },
      });
      toast.success(renewal ? 'Renovação atualizada.' : 'Renovação acrescentada.');
      onDone();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  const err = (k: string) => (errors[k]?.[0] ? <p className="mt-1 text-xs text-danger">{errors[k]![0]}</p> : null);
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-medium">
        Tipo
        <Select
          value={form.kind}
          onChange={(e) => {
            const kind = e.target.value as RenewalKind;
            // Muda o nome sugerido se ainda for o do tipo anterior.
            const title = !form.title || form.title === RENEWAL_KIND_DEFAULT_TITLE[form.kind] ? RENEWAL_KIND_DEFAULT_TITLE[kind] : form.title;
            setForm({ ...form, kind, title, period: kind === 'maintenance' ? 'monthly' : form.period });
          }}
        >
          {RENEWAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {RENEWAL_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Nome
        <Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Domínio clinicasorriso.pt" autoFocus={!renewal} />
        {err('title')}
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Valor (€)
        <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
        {err('amount')}
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        De quanto em quanto tempo
        <Select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as RenewalPeriod })}>
          {RENEWAL_PERIODS.map((p) => (
            <option key={p} value={p}>
              {RENEWAL_PERIOD_LABELS[p]}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-col gap-1 text-xs font-medium">
        <span>Próxima renovação</span>
        <DateInput aria-label="Próxima renovação" value={form.next_due_on} onChange={(v) => setForm({ ...form, next_due_on: v })} />
        {err('next_due_on')}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Avisar
        <Select value={form.remind_days} onChange={(e) => setForm({ ...form, remind_days: Number(e.target.value) })}>
          {REMIND_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} dias antes
            </option>
          ))}
        </Select>
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={save.isPending} disabled={!form.title.trim() || !form.next_due_on}>
          {renewal ? 'Guardar' : 'Acrescentar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function RenewalRow({ lead, r }: { lead: Lead; r: Renewal }) {
  const { data: settings } = useSettings();
  const renew = useRenewRenewal(lead.id);
  const save = useSaveRenewal(lead.id);
  const remove = useDeleteRenewal(lead.id);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recordPayment, setRecordPayment] = useState(true);
  const payments = settings?.features.payments !== false;
  const Icon = KIND_ICON[r.kind];
  const email = renewalEmail(r, lead.contact_name);

  async function doRenew() {
    try {
      const next = await renew.mutateAsync({ id: r.id, record_payment: payments && recordPayment && r.amount > 0 });
      toast.success(`Renovado. Próxima: ${formatDate(next.next_due_on)}${payments && recordPayment && r.amount > 0 ? ' (pagamento registado)' : ''}.`);
      setConfirming(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (editing) return <RenewalForm lead={lead} renewal={r} onDone={() => setEditing(false)} />;
  return (
    <li className={cn('flex flex-col gap-1.5 text-sm', !r.active && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-medium break-words">{r.title}</span> <span className="text-muted tabular">· {renewalPrice(r.amount, r.period)}</span>
          <span className="block text-xs">
            <DueLine r={r} />
          </span>
        </span>
        {r.active ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setConfirming((c) => !c)} aria-expanded={confirming}>
              <Check className="h-3.5 w-3.5" aria-hidden /> Renovado
            </Button>
            {lead.email ? <SendEmailButton lead={lead} subject={email.subject} body={email.body} template="Renovação" label="Email" size="sm" variant="outline" /> : null}
          </>
        ) : null}
        <DropdownRoot>
          <DropdownTrigger className={buttonClasses('ghost', 'icon', 'h-8 w-8')} aria-label={`Mais ações: ${r.title}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </DropdownItem>
            <DropdownItem onSelect={() => save.mutate({ id: r.id, body: { active: !r.active } }, { onError: (e) => toast.error(errorMessage(e)) })}>
              {r.active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {r.active ? 'Pausar (sem avisos)' : 'Retomar'}
            </DropdownItem>
            <DropdownItem
              danger
              onSelect={() => {
                if (window.confirm(`Apagar "${r.title}"? Os pagamentos já registados ficam.`)) remove.mutate(r.id, { onError: (e) => toast.error(errorMessage(e)) });
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Apagar
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
      </div>
      {confirming ? (
        <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
          <span>Passa para a data seguinte.</span>
          {payments && r.amount > 0 ? (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
              Registar o pagamento de {formatCurrency(r.amount)} (pago hoje)
            </label>
          ) : null}
          <Button size="sm" onClick={() => void doRenew()} loading={renew.isPending} className="ml-auto">
            Confirmar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function RenewalsSection({ lead }: { lead: Lead }) {
  const { data: renewals, isLoading } = useRenewals(lead.id);
  const [adding, setAdding] = useState(false);
  const active = (renewals ?? []).filter((r) => r.active);
  const monthly = active.reduce((sum, r) => sum + renewalMonthly(r.amount, r.period), 0);

  return (
    <section aria-labelledby={`renewals-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`renewals-${lead.id}`}
        icon={Repeat}
        title="Renovações e avenças"
        summary={active.length ? `${formatCurrency(monthly)}/mês` : null}
        action={
          adding ? null : (
            // Mesma largura dos botões das outras partes (Despesa, Renovação).
            <Button size="sm" variant="outline" className="min-w-[8.5rem]" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Renovação
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-full" />
      ) : renewals?.length ? (
        <ul className="mt-2 flex flex-col gap-3">
          {renewals.map((r) => (
            <RenewalRow key={r.id} lead={lead} r={r} />
          ))}
        </ul>
      ) : !adding ? (
        <p className="mt-1 text-xs text-muted">Domínio, alojamento ou manutenção mensal: avisa-te uns dias antes de cada renovação, com o email ao cliente já escrito.</p>
      ) : null}
      {adding ? <RenewalForm lead={lead} onDone={() => setAdding(false)} /> : null}
    </section>
  );
}
