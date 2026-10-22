'use client';

/** Aceitar o contrato: nome completo + "li e aceito" (fica registado com data, hora e IP). */
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function AcceptForm({ token, defaultName }: { token: string; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError('Confirme que leu e aceita o contrato.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/public/contracts/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agree }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
        throw new Error(problem?.detail ?? problem?.title ?? 'Não foi possível aceitar. Tente outra vez.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar. Tente outra vez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-accent bg-surface p-4" noValidate aria-label="Aceitar o contrato">
      <h2 className="font-display text-lg font-semibold">Aceitar o contrato</h2>
      <Field label="O seu nome completo" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      </Field>
      <label className="inline-flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        Li o contrato e aceito as condições.
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="self-start">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Aceitar contrato
      </Button>
      <p className="text-xs text-muted">Ao aceitar, ficam registados o nome, a data e a hora. Pode descarregar o PDF a qualquer momento.</p>
    </form>
  );
}
