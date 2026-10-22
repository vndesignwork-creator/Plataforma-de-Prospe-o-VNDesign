'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { safeNextPath } from '@/lib/utils';

export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sem sessão: volta ao login. Já verificado (ou sem a verificação ligada): segue.
  useEffect(() => {
    void getSupabaseBrowserClient()
      .auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data, error: aalError }) => {
        if (aalError || !data) router.replace('/login');
        else if (data.currentLevel === data.nextLevel) router.replace(next);
      });
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setError('O código tem 6 dígitos.');
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === 'verified');
    if (!factor) {
      setBusy(false);
      router.replace(next);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: digits });
    if (verifyError) {
      setBusy(false);
      setError('Código errado ou expirado. Confirma a hora do telemóvel e tenta o código seguinte.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace('/login');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6" noValidate>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Field label="Código" required>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center text-lg tracking-[0.4em] tabular"
        />
      </Field>
      <Button type="submit" loading={busy} className="w-full">
        Confirmar
      </Button>
      <button type="button" onClick={signOut} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
        Entrar com outra conta
      </button>
      <p className="text-xs text-muted">Perdeste o telemóvel? Pede ao administrador para desligar a verificação na tua conta (Supabase → Authentication).</p>
    </form>
  );
}
