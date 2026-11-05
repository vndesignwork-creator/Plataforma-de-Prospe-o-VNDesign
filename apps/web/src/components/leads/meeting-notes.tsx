'use client';

/**
 * "Notas com IA" (linha do tempo): os apontamentos de uma reunião ou chamada,
 * uma conversa colada (WhatsApp/email) ou a gravação da reunião (passada a
 * texto); a IA propõe o resumo, as tarefas, o próximo passo e a fase; a pessoa
 * revê, escolhe e grava (nota na linha do tempo, tarefas, próxima ação e fase).
 */
import {
  LEAD_STATUS_META,
  MEETING_NOTES_NOTE_TITLE,
  MEETING_NOTES_SOURCES,
  MEETING_NOTES_SOURCE_LABELS,
  type Lead,
  type LeadStatus,
  type MeetingNotesResult,
  type MeetingNotesSource,
} from '@vndesign/core';
import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { consumeLeadAction } from '@/lib/lead-actions';
import { useInvalidateLead, useInvalidateTasks } from '@/lib/queries';
import { DictateButton, appendDictation } from '@/components/ui/dictate-button';
import { cn } from '@/lib/utils';
import { MeetingRecorder, type RecorderControl, type RecorderState } from './meeting-recorder';

type TaskDraft = { title: string; due_on: string; keep: boolean };

export function MeetingNotesButton({ lead }: { lead: Lead }) {
  // Pesquisa rápida → "Notas com IA" abre logo.
  const [open, setOpen] = useState(() => consumeLeadAction('notas'));
  if (lead.anonymized_at) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Resumo, tarefas e próximo passo a partir dos apontamentos, de uma conversa colada ou da gravação da reunião">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Notas com IA
      </Button>
      {open ? <MeetingNotesDialog lead={lead} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MeetingNotesDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const invalidateLead = useInvalidateLead();
  const invalidateTasks = useInvalidateTasks();
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<MeetingNotesSource>('notes');
  // Gravação já passada a texto: o texto fica para rever antes de resumir.
  const [transcribed, setTranscribed] = useState(false);
  const [recState, setRecState] = useState<RecorderState>('idle');
  const recorder = useRef<RecorderControl>(null);
  const [status, setStatus] = useState<{ value: LeadStatus; keep: boolean } | null>(null);
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null);
  const [result, setResult] = useState<MeetingNotesResult | null>(null);
  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [next, setNext] = useState<{ text: string; on: string; keep: boolean } | null>(null);

  async function summarize(text = notes) {
    setBusy('ai');
    try {
      const { data } = await api<{ data: MeetingNotesResult }>(`/leads/${lead.id}/meeting-notes`, { method: 'POST', body: { notes: text, source } });
      setResult(data);
      setSummary(data.summary);
      setTasks(data.tasks.map((t) => ({ title: t.title, due_on: t.due_on ?? '', keep: true })));
      setNext(data.next_action ? { text: data.next_action.text, on: data.next_action.on ?? '', keep: true } : null);
      // Fase sugerida, só se for diferente da atual (fica por marcar: a pessoa decide).
      setStatus(data.status && data.status !== lead.status ? { value: data.status, keep: false } : null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    try {
      if (summary.trim()) {
        await api(`/leads/${lead.id}/activities`, { method: 'POST', body: { type: 'note', body: `${MEETING_NOTES_NOTE_TITLE[source]}\n\n${summary.trim()}` } });
      }
      const chosen = tasks.filter((t) => t.keep && t.title.trim());
      for (const t of chosen) {
        await api(`/leads/${lead.id}/tasks`, { method: 'POST', body: { title: t.title.trim(), due_on: t.due_on || null } });
      }
      if (next?.keep && next.text.trim()) {
        await api(`/leads/${lead.id}`, { method: 'PATCH', body: { next_action_text: next.text.trim(), next_action_on: next.on || null } });
      }
      if (status?.keep) await api(`/leads/${lead.id}`, { method: 'PATCH', body: { status: status.value } });
      invalidateLead(lead.id);
      invalidateTasks(lead.id);
      toast.success(
        `Guardado: resumo${chosen.length ? `, ${chosen.length} tarefa${chosen.length === 1 ? '' : 's'}` : ''}${next?.keep && next.text.trim() ? ' e próximo passo' : ''}${status?.keep ? `; fase: ${LEAD_STATUS_META[status.value].label}` : ''}.`,
      );
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  // A gravar (ou em pausa): Resumir termina a gravação, passa-a a texto e resume logo.
  const liveRecording = source === 'recording' && !transcribed && (recState === 'recording' || recState === 'paused');
  // Fechar a meio da gravação deita-a fora (pergunta antes, se for longa).
  const close = () => {
    if (liveRecording && recorder.current && !recorder.current.discard()) return;
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? close() : undefined)}
      title="Notas com IA"
      description={`${lead.company_name} — apontamentos, uma conversa colada ou a gravação da reunião.`}
      className="max-w-2xl"
      footer={
        result ? (
          <>
            <Button variant="ghost" onClick={() => setResult(null)} disabled={!!busy}>
              Voltar aos apontamentos
            </Button>
            <Button onClick={() => void save()} loading={busy === 'save'}>
              Guardar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button
              onClick={() => (liveRecording ? recorder.current?.finish('summarize') : void summarize())}
              loading={busy === 'ai' || (source === 'recording' && recState === 'sending')}
              disabled={!liveRecording && (notes.trim().length < 20 || (source === 'recording' && !transcribed))}
            >
              <Sparkles className="h-4 w-4" aria-hidden /> Resumir
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="De onde vem o texto" className="inline-flex self-start rounded-lg border border-border-input bg-surface-2 p-0.5 text-sm">
            {MEETING_NOTES_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={source === s}
                disabled={liveRecording && s !== source}
                title={liveRecording && s !== source ? 'Termina ou descarta a gravação primeiro' : undefined}
                onClick={() => setSource(s)}
                className={cn('rounded-md px-3 py-1.5', source === s ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg disabled:opacity-50 disabled:hover:text-muted')}
              >
                {MEETING_NOTES_SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
          {source === 'recording' && !transcribed ? (
            <MeetingRecorder
              leadId={lead.id}
              control={recorder}
              onStateChange={setRecState}
              onText={(text, andSummarize) => {
                setNotes(text);
                setTranscribed(true);
                if (!andSummarize) return;
                if (text.trim().length >= 20) void summarize(text);
                else toast('A gravação tem pouco texto: revê-o e completa antes de resumir.');
              }}
            />
          ) : (
            <>
              <Field
                label={source === 'conversation' ? 'Conversa' : source === 'recording' ? 'Texto da gravação' : 'Apontamentos'}
                hint={
                  source === 'conversation'
                    ? 'Cola a conversa do WhatsApp (no telemóvel: tocar sem soltar → Selecionar → Copiar; ou Exportar conversa) ou o email. A IA não grava nada: revês tudo antes.'
                    : source === 'recording'
                      ? 'Revê o texto (o reconhecimento pode trocar palavras) e carrega em Resumir.'
                      : 'Escreve, cola ou carrega em Ditar e fala. A IA não grava nada: revês tudo antes.'
                }
              >
                <Textarea
                  rows={source === 'notes' ? 9 : 12}
                  value={notes}
                  maxLength={60_000}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    source === 'conversation'
                      ? '[10:02] Marta: Olá! Vi o vosso trabalho e gostava de um site novo…\n[10:05] Eu: Olá Marta, claro! Para quando precisavam?'
                      : 'Ex.: Falei com a Marta. Querem loja online até ao Natal, orçamento até 2000 €. Mandar proposta até sexta e ligar na próxima semana.'
                  }
                />
              </Field>
              {source === 'notes' ? (
                <DictateButton onText={(spoken) => setNotes((current) => appendDictation(current, spoken).slice(0, 60_000))} className="self-start" />
              ) : source === 'recording' ? (
                <button type="button" onClick={() => setTranscribed(false)} className="self-start text-xs text-muted underline">
                  Gravar ou escolher outra vez
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Resumo (vai para a linha do tempo)">
            <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Tarefas</legend>
            {tasks.length ? null : <p className="text-sm text-muted">A IA não encontrou tarefas.</p>}
            {tasks.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={t.keep}
                  onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                  aria-label={`Criar a tarefa ${i + 1}`}
                  className="h-4 w-4"
                />
                <Input
                  value={t.title}
                  onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  aria-label={`Tarefa ${i + 1}`}
                  maxLength={300}
                  className="min-w-0 flex-[1_1_14rem]"
                />
                <DateInput value={t.due_on} onChange={(v) => setTasks(tasks.map((x, j) => (j === i ? { ...x, due_on: v } : x)))} aria-label={`Prazo da tarefa ${i + 1}`} className="w-40" />
              </div>
            ))}
          </fieldset>
          {status ? (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={status.keep} onChange={(e) => setStatus({ ...status, keep: e.target.checked })} className="h-4 w-4" />
              <span>
                Mudar a fase de <strong>{LEAD_STATUS_META[lead.status].label}</strong> para <strong>{LEAD_STATUS_META[status.value].label}</strong>
                <span className="text-muted"> (é o que a conversa mostra)</span>
              </span>
            </label>
          ) : null}
          {next ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Próximo passo (próxima ação do lead)</legend>
              <div className="flex flex-wrap items-center gap-2">
                <input type="checkbox" checked={next.keep} onChange={(e) => setNext({ ...next, keep: e.target.checked })} aria-label="Guardar o próximo passo" className="h-4 w-4" />
                <Input value={next.text} onChange={(e) => setNext({ ...next, text: e.target.value })} aria-label="Próximo passo" maxLength={300} className="min-w-0 flex-[1_1_14rem]" />
                <DateInput value={next.on} onChange={(v) => setNext({ ...next, on: v })} aria-label="Data do próximo passo" className="w-40" />
              </div>
            </fieldset>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
