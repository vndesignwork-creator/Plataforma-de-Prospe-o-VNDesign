'use client';

/** "Deixe o seu contacto" no cartão: fica lead na plataforma de quem o partilhou. */
import { CheckCircle2, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';

const input =
  'h-11 w-full rounded-lg border border-border-input bg-surface-2 px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:text-sm';

export function CardContactForm({ token, firstName }: { token: string; firstName: string }) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/public/cards/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (res.ok && body?.ok) setDone(body.message ?? 'Obrigado!');
      else setError(body?.message ?? 'Não foi possível enviar. Tente outra vez.');
    } catch {
      setError('Sem ligação. Tente outra vez.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-4 font-medium text-success">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> {done}
      </p>
    );
  }
  return (
    <section aria-labelledby="deixar-contacto" className="rounded-2xl border border-border bg-surface px-4 py-5">
      <h2 id="deixar-contacto" className="font-display text-lg font-semibold">
        Deixe o seu contacto
      </h2>
      <p className="mb-4 text-sm text-muted">{firstName} entra em contacto consigo.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nome
          <input name="name" required maxLength={120} autoComplete="name" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span>
            Empresa <span className="font-normal text-muted">(opcional)</span>
          </span>
          <input name="company" maxLength={200} autoComplete="organization" className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input name="email" type="email" maxLength={200} autoComplete="email" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Telefone
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={input} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span>
            Mensagem <span className="font-normal text-muted">(opcional)</span>
          </span>
          <textarea name="message" rows={3} maxLength={2000} className={`${input} h-auto py-2`} />
        </label>
        {/* Campo escondido contra robôs. */}
        <input name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <p className="text-xs text-muted">Indique o email ou o telefone.</p>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={sending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong px-4 font-semibold hover:bg-surface-2 disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden /> {sending ? 'A enviar…' : 'Enviar'}
        </button>
      </form>
    </section>
  );
}
