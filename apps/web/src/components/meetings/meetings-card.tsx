'use client';

/**
 * Reuniões do lead: marcar (o lead passa a "Reunião"), enviar o convite de
 * calendário ao cliente, juntar ao próprio calendário (.ics) e desmarcar.
 */
import { MEETING_DURATIONS, type Lead, type LeadMeeting } from '@vndesign/core';
import { CalendarPlus, CalendarX, Download, MapPin } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { DateTimeInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { localInputToIso } from '@/lib/local-datetime';
import { useCancelMeeting, useCreateMeeting, useMailAccount, useMeetings } from '@/lib/queries';
import { cn } from '@/lib/utils';

const whenFmt = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
/** "ter., 28/10, 10:00" */
export const meetingLabel = (iso: string) => whenFmt.format(new Date(iso));

export function MeetingDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const create = useCreateMeeting(lead.id);
  const { data: account } = useMailAccount();
  const [form, setForm] = useState({
    starts_at: '',
    duration_min: '30',
    location: '',
    notes: '',
    send_invite: !!lead.email,
    invite_to: lead.email ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const startsAt = localInputToIso(form.starts_at);
    if (!startsAt) {
      setErrors({ starts_at: ['Indica o dia e a hora.'] });
      return;
    }
    try {
      const result = await create.mutateAsync({
        starts_at: startsAt,
        duration_min: Number(form.duration_min),
        location: form.location,
        notes: form.notes,
        send_invite: form.send_invite,
        ...(form.send_invite && form.invite_to ? { invite_to: form.invite_to } : {}),
      });
      toast.success(
        `Reunião marcada para ${meetingLabel(result.meeting.starts_at)}.` +
          (result.invite_sent_to ? ` Convite enviado para ${result.invite_sent_to}.` : '') +
          (result.status_changed ? ' Estado: Reunião.' : ''),
      );
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Marcar reunião"
      description={lead.company_name}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="meeting-form" loading={create.isPending}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> Marcar
          </Button>
        </>
      }
    >
      <form id="meeting-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Dia e hora" required error={errors.starts_at?.[0]}>
          <DateTimeInput value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />
        </Field>
        <Field label="Duração">
          <Select value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })}>
            {MEETING_DURATIONS.map((d) => (
              <option key={d} value={String(d)}>
                {d < 60 ? `${d} minutos` : d === 60 ? '1 hora' : `${d / 60} horas`.replace('.5', ',5')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Local ou link" error={errors.location?.[0]} className="sm:col-span-2" hint="Morada, link do Google Meet/Zoom ou “Telefone”.">
          <Input value={form.location} maxLength={500} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </Field>
        <Field label="Notas (opcional)" error={errors.notes?.[0]} className="sm:col-span-2" hint="Também vão no convite.">
          <Textarea rows={2} value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.send_invite}
              onChange={(e) => setForm({ ...form, send_invite: e.target.checked })}
            />
            Enviar o convite ao cliente por email (entra no calendário dele)
          </label>
          {form.send_invite ? (
            account ? (
              <Field label="Email do cliente" error={errors.invite_to?.[0]}>
                <Input type="email" inputMode="email" value={form.invite_to} onChange={(e) => setForm({ ...form, invite_to: e.target.value })} />
              </Field>
            ) : (
              <p className="text-sm text-warning">Para enviar o convite, liga primeiro a tua conta em Definições → Email de envio.</p>
            )
          ) : null}
        </fieldset>
        <p className="text-xs text-muted sm:col-span-2">Recebes uma notificação 1 hora antes (com as notificações ativadas).</p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function MeetingRow({ lead, meeting, now }: { lead: Lead; meeting: LeadMeeting; now: number }) {
  const cancel = useCancelMeeting(lead.id);
  const [confirm, setConfirm] = useState(false);
  const past = new Date(meeting.starts_at).getTime() < now;
  const canceled = !!meeting.canceled_at;

  async function doCancel(notify: boolean) {
    try {
      await cancel.mutateAsync({ id: meeting.id, notify });
      setConfirm(false);
      toast.success(notify && meeting.invite_sent_to ? `Reunião desmarcada. O cliente foi avisado.` : 'Reunião desmarcada.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <li className={cn('flex items-start gap-3 px-4 py-2.5', (past || canceled) && 'opacity-70')}>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', canceled && 'line-through')}>
          {meetingLabel(meeting.starts_at)} · {meeting.duration_min} min
        </span>
        {meeting.location ? (
          <span className="mt-0.5 flex items-center gap-1 text-xs break-words text-muted">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {meeting.location}
          </span>
        ) : null}
        <span className="mt-1 flex flex-wrap gap-1.5">
          {canceled ? <Badge tone="danger">Desmarcada</Badge> : past ? <Badge>Passou</Badge> : <Badge tone="accent">Marcada</Badge>}
          {meeting.invite_sent_to && !canceled ? <Badge>Convite enviado</Badge> : null}
        </span>
      </span>
      {!canceled && !past ? (
        <span className="flex shrink-0 gap-1">
          <a
            href={`/api/v1/meetings/${meeting.id}/ics`}
            className={buttonClasses('ghost', 'icon', 'h-8 w-8')}
            aria-label="Juntar ao meu calendário (.ics)"
            title="Juntar ao meu calendário"
          >
            <Download className="h-4 w-4" aria-hidden />
          </a>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirm(true)} aria-label="Desmarcar a reunião" title="Desmarcar">
            <CalendarX className="h-4 w-4" aria-hidden />
          </Button>
        </span>
      ) : null}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Desmarcar a reunião?"
        description={meeting.invite_sent_to ? `O cliente recebeu o convite (${meeting.invite_sent_to}).` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            {meeting.invite_sent_to ? (
              <>
                <Button variant="outline" onClick={() => void doCancel(false)} loading={cancel.isPending}>
                  Desmarcar sem avisar
                </Button>
                <Button variant="danger" onClick={() => void doCancel(true)} loading={cancel.isPending}>
                  Desmarcar e avisar o cliente
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => void doCancel(false)} loading={cancel.isPending}>
                Desmarcar
              </Button>
            )}
          </>
        }
      />
    </li>
  );
}

export function MeetingsCard({ lead }: { lead: Lead }) {
  const { data: meetings, isLoading } = useMeetings(lead.id);
  const [open, setOpen] = useState(false);
  // Hora fixa ao abrir a ficha (a lista volta a ser pedida quando muda).
  const [now] = useState(() => Date.now());
  if (lead.anonymized_at) return null;
  // Próximas primeiro (por ordem), depois as passadas (só as 3 últimas).
  const upcoming = (meetings ?? []).filter((m) => !m.canceled_at && new Date(m.starts_at).getTime() >= now).reverse();
  const others = (meetings ?? []).filter((m) => !upcoming.includes(m)).slice(0, 3);

  return (
    <Card>
      <CardHeader
        title="Reuniões"
        actions={
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Marcar reunião
          </Button>
        }
      />
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-10" />
        </div>
      ) : upcoming.length || others.length ? (
        <ul className="divide-y divide-border" aria-label="Reuniões do lead">
          {[...upcoming, ...others].map((m) => (
            <MeetingRow key={m.id} lead={lead} meeting={m} now={now} />
          ))}
        </ul>
      ) : (
        <p className="p-4 text-center text-sm text-muted">Sem reuniões marcadas.</p>
      )}
      {open ? <MeetingDialog lead={lead} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}
