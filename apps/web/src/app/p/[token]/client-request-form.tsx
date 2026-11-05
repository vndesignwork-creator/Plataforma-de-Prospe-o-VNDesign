'use client';

/** Na página do cliente: enviar o que falta (uma nota e/ou ficheiros) para um pedido. */
import { CLIENT_REQUEST_MAX_FILES, CLIENT_REQUEST_MAX_FILE_BYTES } from '@vndesign/core';
import { Paperclip, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

export function ClientRequestForm({ token, id, title, sent }: { token: string; id: string; title: string; sent: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function pick(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    const big = chosen.find((f) => f.size > CLIENT_REQUEST_MAX_FILE_BYTES);
    if (big) {
      setMessage({ ok: false, text: `"${big.name}" tem mais de 25 MB. Envie-o por outro meio (ex.: WeTransfer) e deixe o link na nota.` });
      return;
    }
    setMessage(null);
    setFiles((current) => [...current, ...chosen].slice(0, CLIENT_REQUEST_MAX_FILES));
  }

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      if (note.trim()) form.set('note', note.trim());
      for (const f of files) form.append('files', f);
      const res = await fetch(`/api/v1/public/projects/${token}/requests/${id}`, { method: 'POST', body: form });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(problem?.detail ?? problem?.title ?? 'Não foi possível enviar. Tente outra vez.');
      }
      setMessage({ ok: true, text: 'Obrigado! Recebemos o que enviou.' });
      setOpen(false);
      setNote('');
      setFiles([]);
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível enviar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2">
      {!open ? (
        <div>
          <Button size="sm" variant={sent ? 'outline' : 'primary'} onClick={() => setOpen(true)} aria-label={`${sent ? 'Enviar mais' : 'Enviar'}: ${title}`}>
            <Send className="h-3.5 w-3.5" aria-hidden /> {sent ? 'Enviar mais' : 'Enviar'}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escreva aqui (ex.: o texto, um link para as fotos ou os acessos)"
            aria-label={`Nota para ${title}`}
            autoFocus
          />
          <input ref={input} type="file" multiple className="sr-only" aria-label={`Ficheiros para ${title}`} onChange={(e) => pick(e.target.files)} />
          {files.length ? (
            <ul className="flex flex-col gap-0.5 text-xs text-muted">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                  <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <button type="button" className="ml-auto text-danger hover:underline" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>
                    Tirar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={files.length >= CLIENT_REQUEST_MAX_FILES}>
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Juntar ficheiros
            </Button>
            <Button type="submit" size="sm" loading={busy} disabled={!note.trim() && !files.length}>
              Enviar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted">Até {CLIENT_REQUEST_MAX_FILES} ficheiros, 25 MB cada.</p>
        </form>
      )}
      {message ? (
        <p role="status" className={`text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
