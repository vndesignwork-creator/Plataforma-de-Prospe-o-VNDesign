'use client';

/**
 * "Notas com IA" (linha do tempo): colar ou ditar os apontamentos de uma reunião
 * ou chamada; a IA propõe o resumo, as tarefas e o próximo passo; a pessoa
 * revê, escolhe e grava (nota na linha do tempo, tarefas e próxima ação).
 */
import type { Lead, MeetingNotesResult } from '@vndesign/core';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
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

type TaskDraft = { title: string; due_on: string; keep: boolean };

export function MeetingNotesButton({ lead }: { lead: Lead }) {
  // Pesquisa rápida → "Notas com IA" abre logo.
  const [open, setOpen] = useState(() => consumeLeadAction('notas'));
  if (lead.anonymized_at) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Resumo, tarefas e próximo passo a partir dos apontamentos">
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
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null);
  const [result, setResult] = useState<MeetingNotesResult | null>(null);
  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [next, setNext] = useState<{ text: string; on: string; keep: boolean } | null>(null);

  async function summarize() {
    setBusy('ai');
    try {
      const { data } = await api<{ data: MeetingNotesResult }>(`/leads/${lead.id}/meeting-notes`, { method: 'POST', body: { notes } });
      setResult(data);
      setSummary(data.summary);
      setTasks(data.tasks.map((t) => ({ title: t.title, due_on: t.due_on ?? '', keep: true })));
      setNext(data.next_action ? { text: data.next_action.text, on: data.next_action.on ?? '', keep: true } : null);
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
        await api(`/leads/${lead.id}/activities`, { method: 'POST', body: { type: 'note', body: `📝 Resumo da reunião/chamada\n\n${summary.trim()}` } });
      }
      const chosen = tasks.filter((t) => t.keep && t.title.trim());
      for (const t of chosen) {
        await api(`/leads/${lead.id}/tasks`, { method: 'POST', body: { title: t.title.trim(), due_on: t.due_on || null } });
      }
      if (next?.keep && next.text.trim()) {
        await api(`/leads/${lead.id}`, { method: 'PATCH', body: { next_action_text: next.text.trim(), next_action_on: next.on || null } });
      }
      invalidateLead(lead.id);
      invalidateTasks(lead.id);
      toast.success(
        `Guardado: resumo${chosen.length ? `, ${chosen.length} tarefa${chosen.length === 1 ? '' : 's'}` : ''}${next?.keep && next.text.trim() ? ' e próximo passo' : ''}.`,
      );
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Notas com IA"
      description={`${lead.company_name} — cola ou dita os apontamentos da reunião ou chamada.`}
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
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void summarize()} loading={busy === 'ai'} disabled={notes.trim().length < 20}>
              <Sparkles className="h-4 w-4" aria-hidden /> Resumir
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="flex flex-col gap-2">
          <Field label="Apontamentos" hint="Escreve, cola ou carrega em Ditar e fala. A IA não grava nada: revês tudo antes.">
            <Textarea
              rows={9}
              value={notes}
              maxLength={20_000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Falei com a Marta. Querem loja online até ao Natal, orçamento até 2000 €. Mandar proposta até sexta e ligar na próxima semana."
            />
          </Field>
          <DictateButton onText={(spoken) => setNotes((current) => appendDictation(current, spoken).slice(0, 20_000))} className="self-start" />
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
