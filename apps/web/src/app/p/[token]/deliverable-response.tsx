'use client';

/** Na página do cliente: aprovar uma entrega ou pedir alterações (com o que mudar). */
import { Check, PencilLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

export function DeliverableResponse({ token, id, title, name }: { token: string; id: string; title: string; name: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'changes'>('idle');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(action: 'approve' | 'changes') {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/public/projects/${token}/deliverables/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment: action === 'changes' ? comment : undefined, name: name ?? undefined }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string; errors?: Record<string, string[]> } | null;
        throw new Error(problem?.errors?.comment?.[0] ?? problem?.detail ?? problem?.title ?? 'Não foi possível enviar. Tente outra vez.');
      }
      setMessage({ ok: true, text: action === 'approve' ? 'Obrigado! Entrega aprovada.' : 'Obrigado! O pedido de alterações foi enviado.' });
      router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível enviar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2">
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void send('approve')} loading={busy} aria-label={`Aprovar: ${title}`}>
            <Check className="h-3.5 w-3.5" aria-hidden /> Aprovar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode('changes')} aria-label={`Pedir alterações: ${title}`}>
            <PencilLine className="h-3.5 w-3.5" aria-hidden /> Pedir alterações
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send('changes');
          }}
        >
          <Textarea
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="O que gostaria de alterar?"
            aria-label={`O que alterar em ${title}`}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={!comment.trim()}>
              Enviar pedido
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Cancelar
            </Button>
          </div>
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
