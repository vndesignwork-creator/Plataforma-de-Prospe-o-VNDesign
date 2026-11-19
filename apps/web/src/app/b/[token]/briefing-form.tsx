'use client';

/** Formulário do briefing: uma caixa por pergunta e ficheiros (até 10, 15 MB cada). */
import { BRIEFING_IMAGE_TYPES, BRIEFING_MAX_FILE_BYTES, BRIEFING_MAX_FILES, BRIEFING_MAX_REFERENCES, BRIEFING_REFERENCE_NOTE_MAX } from '@vndesign/core';
import { Images, Link2, Paperclip, Plus, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

/** Uma referência por escrever: um site ou uma imagem, com a nota do cliente. */
type DraftReference = { id: number; url: string; file: File | null; note: string };
let refSeq = 0;

export function BriefingForm({
  token,
  questions,
  answers,
  sentFiles,
  sentReferences = 0,
}: {
  token: string;
  questions: string[];
  answers: string[];
  sentFiles: number;
  sentReferences?: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => questions.map((_, i) => answers[i] ?? ''));
  const [files, setFiles] = useState<File[]>([]);
  const [references, setReferences] = useState<DraftReference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const room = BRIEFING_MAX_FILES - sentFiles;
  const refRoom = BRIEFING_MAX_REFERENCES - sentReferences - references.length;

  function addReferences(list: FileList | null) {
    setError(null);
    const chosen = Array.from(list ?? []).slice(0, Math.max(0, refRoom));
    const wrong = chosen.find((f) => !BRIEFING_IMAGE_TYPES.includes(f.type as (typeof BRIEFING_IMAGE_TYPES)[number]));
    if (wrong) return setError(`"${wrong.name}" não é uma imagem (PNG, JPG, WEBP ou GIF).`);
    const big = chosen.find((f) => f.size > BRIEFING_MAX_FILE_BYTES);
    if (big) return setError(`"${big.name}" tem mais de 15 MB.`);
    setReferences((list2) => [...list2, ...chosen.map((file) => ({ id: ++refSeq, url: '', file, note: '' }))]);
  }

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
    // Referências: os links vão com a nota pelo índice; as imagens pela ordem em que são enviadas.
    let imageIndex = 0;
    references.forEach((r, i) => {
      if (r.file) {
        form.append('ref_images', r.file);
        form.append(`ref_image_note_${imageIndex++}`, r.note);
      } else if (r.url.trim()) {
        form.append(`ref_link_${i}`, r.url.trim());
        form.append(`ref_link_note_${i}`, r.note);
      }
    });
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/public/briefings/${token}`, { method: 'POST', body: form });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(problem?.detail ?? problem?.title ?? 'Não foi possível enviar. Tente outra vez.');
      }
      setFiles([]);
      setReferences([]);
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
      {refRoom > 0 || references.length ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface p-4">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <Images className="h-4 w-4" aria-hidden /> Referências (opcional)
          </p>
          <p className="mb-3 text-sm text-muted">
            Sites de que gosta e imagens que ajudem a perceber o estilo. Escreva ao lado o que gosta em cada um (ex.: “gosto destas cores”).
          </p>
          <ul className="flex flex-col gap-2">
            {references.map((r, i) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center">
                {r.file ? (
                  <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <Images className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="truncate">{r.file.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                    <Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <Input
                      value={r.url}
                      inputMode="url"
                      placeholder="www.exemplo.pt"
                      aria-label={`Site de referência ${i + 1}`}
                      onChange={(e) => setReferences(references.map((x) => (x.id === r.id ? { ...x, url: e.target.value } : x)))}
                    />
                  </span>
                )}
                <Input
                  value={r.note}
                  maxLength={BRIEFING_REFERENCE_NOTE_MAX}
                  placeholder="O que gosta aqui?"
                  aria-label={`Nota da referência ${i + 1}`}
                  className="sm:max-w-[16rem]"
                  onChange={(e) => setReferences(references.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)))}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 self-end sm:self-auto"
                  aria-label={`Tirar a referência ${i + 1}`}
                  onClick={() => setReferences(references.filter((x) => x.id !== r.id))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {refRoom > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReferences([...references, { id: ++refSeq, url: '', file: null, note: '' }])}>
                <Plus className="h-4 w-4" aria-hidden /> Site de referência
              </Button>
              <input
                id="ref-images"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="peer sr-only"
                onChange={(e) => {
                  addReferences(e.target.files);
                  e.target.value = '';
                }}
              />
              <label
                htmlFor="ref-images"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-sm font-medium hover:bg-surface-3 peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
              >
                <Images className="h-4 w-4" aria-hidden /> Imagens de referência
              </label>
            </div>
          ) : null}
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
