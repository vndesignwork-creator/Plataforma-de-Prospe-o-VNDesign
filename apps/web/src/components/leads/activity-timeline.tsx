'use client';

import {
  ACTIVITY_TYPE_LABELS,
  AI_EMAIL_KIND_LABELS,
  PROPOSAL_STATUS_LABELS,
  type AiEmailKind,
  type ProposalStatus,
  LEAD_FIELD_LABELS,
  LEAD_STATUS_META,
  formatDate,
  formatDateTime,
  type Activity,
  type LeadStatus,
} from '@vndesign/core';
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit3,
  FileText,
  Gauge,
  Sparkles,
  GitMerge,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Repeat,
  ShieldOff,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useActivities, useLogActivity } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';

const ICONS: Partial<Record<Activity['type'], LucideIcon>> = {
  created: Plus,
  updated: Edit3,
  status_changed: Repeat,
  note: MessageSquare,
  email_copied: Copy,
  email_mailto: Mail,
  email_sent: Mail,
  call_logged: Phone,
  merged: GitMerge,
  follow_up_scheduled: CalendarClock,
  follow_up_done: CheckCircle2,
  template_used: MessageSquare,
  anonymized: ShieldOff,
  archived: Archive,
  unarchived: ArchiveRestore,
  audit_run: Gauge,
  proposal_generated: FileText,
  ai_email_generated: Sparkles,
};

const fieldLabel = (f: string) => (LEAD_FIELD_LABELS as Record<string, string>)[f] ?? f;
const statusLabel = (s: unknown) => LEAD_STATUS_META[s as LeadStatus]?.label ?? String(s);

function describe(a: Activity): string | null {
  const p = a.payload as Record<string, unknown>;
  switch (a.type) {
    case 'status_changed':
      return `${statusLabel(p.from)} → ${statusLabel(p.to)}`;
    case 'updated':
      return Array.isArray(p.fields) ? p.fields.map((f) => fieldLabel(String(f))).join(', ') : null;
    case 'follow_up_scheduled':
      return `${p.snoozed ? 'Adiado: ' : ''}${p.text ?? 'Follow-up'} para ${formatDate(String(p.on))}`;
    case 'merged': {
      const numbers = Array.isArray(p.merged_numbers) ? p.merged_numbers : [];
      return numbers.length ? `Juntou ${numbers.map((n) => `#${n}`).join(', ')}` : 'Dados de um novo registo';
    }
    case 'created':
      return p.source ? `Origem: ${String(p.source)}` : null;
    case 'email_copied':
      return p.template ? `Modelo: ${String(p.template)}` : p.part === 'subject' ? 'Assunto' : p.part === 'body' ? 'Corpo do email' : null;
    case 'email_mailto':
    case 'email_sent':
    case 'call_logged':
    case 'template_used':
      return p.template ? `Modelo: ${String(p.template)}` : null;
    case 'follow_up_done':
      return [p.done_text ? `${String(p.done_text)} ✓` : null, p.on ? `Próximo: ${formatDate(String(p.on))}` : 'Sem próxima ação']
        .filter(Boolean)
        .join(' · ');
    case 'audit_run': {
      const parts = [
        typeof p.pagespeed === 'number' ? `PageSpeed ${p.pagespeed}` : null,
        typeof p.issues === 'number' ? (p.issues === 1 ? '1 problema' : `${p.issues} problemas`) : null,
      ];
      return parts.filter(Boolean).join(' · ') || null;
    }
    case 'proposal_generated':
      return [
        p.code ? `Proposta ${String(p.code)}` : null,
        p.total ? String(p.total) : null,
        p.status ? PROPOSAL_STATUS_LABELS[p.status as ProposalStatus] : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'ai_email_generated':
      return p.kind ? AI_EMAIL_KIND_LABELS[p.kind as AiEmailKind] ?? null : null;
    case 'archived':
      return p.auto ? 'Automático: em "Sem interesse" há mais tempo do que o definido' : null;
    case 'anonymized':
      return p.added_to_do_not_contact ? 'Acrescentado à lista "não contactar"' : null;
    default:
      return null;
  }
}

const LOG_TYPES = [
  { value: 'note', label: 'Nota' },
  { value: 'call_logged', label: 'Chamada' },
  { value: 'email_sent', label: 'Email enviado' },
];

export function ActivityTimeline({ leadId, currentUserId }: { leadId: string; currentUserId?: string }) {
  const { data, isLoading } = useActivities(leadId);
  const log = useLogActivity(leadId);
  const qc = useQueryClient();
  const [type, setType] = useState('note');
  const [body, setBody] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (type === 'note' && !body.trim()) return;
    try {
      await log.mutateAsync({ type, body: body.trim() || undefined });
      setBody('');
      toast.success(type === 'note' ? 'Nota adicionada.' : 'Registado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function removeNote(activityId: string) {
    try {
      await api(`/leads/${leadId}/activities/${activityId}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: ['activities', leadId] });
      toast.success('Nota apagada.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader title="Linha do tempo" as="h2" />
      <form onSubmit={submit} className="flex flex-col gap-2 border-b border-border p-4">
        <label htmlFor="activity-body" className="sr-only">
          Texto do registo
        </label>
        <Textarea
          id="activity-body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={type === 'note' ? 'Escreve uma nota…' : 'Detalhes (opcional)…'}
        />
        <div className="flex gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de registo" className="h-9 flex-1">
            {LOG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" className="h-9" loading={log.isPending} disabled={type === 'note' && !body.trim()}>
            Registar
          </Button>
        </div>
      </form>
      {isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <ol className="flex flex-col gap-0 p-4" aria-label="Atividade do lead">
          {(data ?? []).map((a) => {
            const Icon = ICONS[a.type] ?? Edit3;
            const detail = describe(a);
            return (
              <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                <span className="absolute top-8 bottom-0 left-4 w-px bg-border" aria-hidden />
                <span className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2">
                  <Icon className="h-4 w-4 text-muted" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="flex items-start justify-between gap-2 text-sm">
                    <span className="font-medium">{ACTIVITY_TYPE_LABELS[a.type]}</span>
                    {a.type === 'note' && a.actor_user_id === currentUserId ? (
                      <button
                        type="button"
                        onClick={() => removeNote(a.id)}
                        className="rounded p-0.5 text-muted hover:text-danger"
                        aria-label="Apagar nota"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </p>
                  {detail ? <p className="text-sm text-muted">{detail}</p> : null}
                  {a.body ? <p className="mt-1 text-sm break-words whitespace-pre-line">{a.body}</p> : null}
                  <p className="mt-0.5 text-xs text-muted tabular">
                    <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                    {a.actor_token_id ? ' · via API' : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
