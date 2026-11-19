'use client';

/**
 * Na página do cliente: a imagem da entrega com os comentários em cima dela.
 * O cliente clica num ponto e escreve ali o que quer mudar — assim não é
 * preciso explicar por palavras onde fica "aquele botão".
 */
import { pinNumbers, type DeliverablePin } from '@vndesign/core';
import { MessageSquarePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

export function DeliverableImage({
  token,
  id,
  title,
  name,
  pins,
  canComment,
}: {
  token: string;
  id: string;
  title: string;
  /** Nome do cliente (vai junto ao comentário). */
  name: string | null;
  pins: DeliverablePin[];
  /** A página aceita respostas do cliente (aprovações ligadas). */
  canComment: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ x: number; y: number; comment: string } | null>(null);
  const [mine, setMine] = useState<DeliverablePin[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const all = [...pins, ...mine.filter((m) => !pins.some((p) => p.id === m.id))];
  const numbers = pinNumbers(all);

  function place(e: React.MouseEvent<HTMLDivElement>) {
    if (!canComment) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100));
    setMessage(null);
    setDraft({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, comment: '' });
  }

  async function send() {
    if (!draft?.comment.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/public/projects/${token}/deliverables/${id}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: draft.x, y: draft.y, comment: draft.comment.trim(), name: name ?? undefined }),
      });
      const json = (await res.json().catch(() => null)) as { data?: DeliverablePin; detail?: string; title?: string } | null;
      if (!res.ok || !json?.data) throw new Error(json?.detail ?? json?.title ?? 'Não foi possível enviar. Tente outra vez.');
      setMine((list) => [...list, json.data!]);
      setDraft(null);
      setMessage({ ok: true, text: 'Obrigado! O comentário foi enviado.' });
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível enviar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 w-full">
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem com link temporário do servidor */}
        <img src={`/api/v1/public/projects/${token}/deliverables/${id}/image`} alt={`Entrega ${title}`} className="block w-full" draggable={false} />
        <div
          className={`absolute inset-0 ${canComment ? 'cursor-crosshair' : ''}`}
          onClick={place}
          role="presentation"
          data-testid="camada-comentarios"
        >
          {all.map((p) => (
            <span
              key={p.id}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              title={p.comment}
              className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-md ${
                p.resolved_at ? 'bg-success text-white' : p.author === 'cliente' ? 'bg-accent text-accent-fg' : 'bg-fg text-bg'
              }`}
            >
              {numbers.get(p.id)}
            </span>
          ))}
          {draft ? (
            <span
              style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
              className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent text-xs font-bold text-accent-fg shadow-md"
              aria-hidden
            >
              +
            </span>
          ) : null}
        </div>
      </div>
      {canComment ? <p className="mt-1 text-xs text-muted">Carregue num ponto da imagem para comentar aí.</p> : null}

      {draft ? (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            rows={3}
            maxLength={1000}
            autoFocus
            value={draft.comment}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            placeholder="Ex.: este botão maior e noutra cor"
            aria-label={`Comentário na imagem de ${title}`}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={!draft.comment.trim()}>
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Enviar comentário
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {all.length ? (
        <ol className="mt-2 flex flex-col gap-1 text-sm" aria-label={`Comentários na imagem de ${title}`}>
          {all.map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  p.resolved_at ? 'bg-success text-white' : p.author === 'cliente' ? 'bg-accent text-accent-fg' : 'bg-fg text-bg'
                }`}
              >
                {numbers.get(p.id)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={p.resolved_at ? 'line-through' : undefined}>{p.comment}</span>
                <span className="ml-1 text-xs text-muted">
                  — {p.author === 'cliente' ? (p.author_name ?? 'Cliente') : 'Nós'}
                  {p.resolved_at ? ' · já tratado' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {message ? (
        <p role="status" className={`mt-2 text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
