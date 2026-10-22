'use client';

/** Formulário do briefing: uma caixa por pergunta e ficheiros (até 10, 15 MB cada). */
import { BRIEFING_MAX_FILE_BYTES, BRIEFING_MAX_FILES } from '@vndesign/core';
import { Paperclip, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

export function BriefingForm({ token, questions, answers, sentFiles }: { token: string; questions: string[]; answers: string[]; sentFiles: number }) {
  const router = useRouter();
  const [values, setValues] = useState(() => questions.map((_, i) => answers[i] ?? ''));
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const room = BRIEFING_MAX_FILES - sentFiles;

  function pick(list: FileList | null) {
    setError(null);
    const chosen = Array.from(list ?? []);
    const big = chosen.find((f) => f.size > BRIEFING_MAX_FILE_BYTES);
    if (big) return setError(`"${big.name}" tem mais de 15 MB.`);
    if (chosen.length > room) return setError(`Pode enviar até ${room} ficheiro${room === 1 ? '' : 's'}.`);
    setFiles(chosen);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.some((v) => v.trim())) return setError('Responda pelo menos a uma pergunta.');
    const form = new FormData();
    values.forEach((v, i) => form.append(`answer_${i}`, v));
    files.forEach((f) => form.append('files', f));
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/public/briefings/${token}`, { method: 'POST', body: form });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(problem?.detail ?? problem?.title ?? 'Não foi possível enviar. Tente outra vez.');
      }
      setFiles([]);
      router.refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar. Tente outra vez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-label="Briefing do projeto">
      {questions.map((q, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-4">
          <label htmlFor={`q-${i}`} className="mb-2 block font-medium">
            <span className="text-accent-text">{i + 1}.</span> {q}
          </label>
          <Textarea id={`q-${i}`} rows={3} maxLength={5000} value={values[i]} onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))} />
        </div>
      ))}
      {room > 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-4">
          <label htmlFor="files" className="mb-1 flex items-center gap-2 font-medium">
            <Paperclip className="h-4 w-4" aria-hidden /> Ficheiros (opcional)
          </label>
          <p className="mb-2 text-sm text-muted">Logótipo, fotografias, textos, manual de marca… Até {room} ficheiro{room === 1 ? '' : 's'}, 15 MB cada.</p>
          {/* O botão nativo aparece na língua do browser; este fica sempre em português. */}
          <input id="files" type="file" multiple onChange={(e) => pick(e.target.files)} className="peer sr-only" />
          <label
            htmlFor="files"
            aria-hidden
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3 peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
          >
            <Paperclip className="h-4 w-4" aria-hidden /> Escolher ficheiros
          </label>
          <p className="mt-2 text-sm text-muted">{files.length ? files.map((f) => f.name).join(', ') : 'Nenhum ficheiro escolhido.'}</p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="self-start">
        <Send className="h-4 w-4" aria-hidden /> Enviar briefing
      </Button>
    </form>
  );
}
