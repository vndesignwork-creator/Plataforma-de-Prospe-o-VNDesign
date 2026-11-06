'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Errors = Record<string, string[]>;

export function FreeAuditForm({ token, brand }: { token: string; brand: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = await fetch(`/api/v1/public/free-audit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          website: form.get('website'),
          email: form.get('email'),
          name: form.get('name') || undefined,
          company: form.get('company') || undefined,
          consent: form.get('consent') === 'on',
          _gotcha: form.get('_gotcha') || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; message: string; errors?: Errors | null } | null;
      if (res.ok && data?.ok) setDone(data.message);
      else {
        setError(data?.message ?? 'Não foi possível enviar. Tente outra vez.');
        setErrors(data?.errors ?? {});
      }
    } catch {
      setError('Sem ligação. Tente outra vez.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-4 font-medium text-success">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {done}
      </p>
    );
  }
  const err = (k: string) => errors[k]?.[0];
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Endereço do site *</span>
        <Input name="website" required placeholder="www.o-meu-negocio.pt" autoComplete="url" inputMode="url" aria-invalid={err('website') ? true : undefined} />
        {err('website') ? <span className="text-xs text-danger">{err('website')}</span> : null}
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Email para receber a análise *</span>
        <Input name="email" type="email" required placeholder="nome@exemplo.pt" autoComplete="email" aria-invalid={err('email') ? true : undefined} />
        {err('email') ? <span className="text-xs text-danger">{err('email')}</span> : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">O seu nome</span>
          <Input name="name" autoComplete="name" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Nome do negócio</span>
          <Input name="company" autoComplete="organization" />
        </label>
      </div>
      {/* Campo escondido para robôs. */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" />
        <span>
          Aceito que {brand} me envie a análise e me contacte sobre ela. Pode pedir para apagar os seus dados a qualquer momento.
          {err('consent') ? <span className="block text-xs text-danger">{err('consent')}</span> : null}
        </span>
      </label>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="w-full">
        Analisar o meu site
      </Button>
    </form>
  );
}
