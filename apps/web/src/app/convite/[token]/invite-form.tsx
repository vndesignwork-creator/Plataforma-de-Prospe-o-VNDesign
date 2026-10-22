'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type Mode = 'create' | 'login';

export function InviteForm({
  token,
  email,
  name: initialName,
  accepted,
  sessionEmail,
}: {
  token: string;
  email: string;
  name: string | null;
  accepted: boolean;
  sessionEmail: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(accepted ? 'login' : 'create');
  const [name, setName] = useState(initialName ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sameAccount = sessionEmail?.toLowerCase() === email;

  async function claim() {
    const res = await fetch(`/api/v1/collab/invites/${token}/claim`, { method: 'POST' });
    if (!res.ok) {
      const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
      throw new Error(problem?.detail ?? problem?.title ?? 'Não foi possível aceitar o convite.');
    }
    router.replace('/colaborador');
    router.refresh();
  }

  async function signIn() {
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (authError) throw new Error(authError.message.toLowerCase().includes('invalid') ? 'Palavra-passe incorreta.' : 'Não foi possível entrar. Tenta novamente.');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (sameAccount) {
        await claim();
        return;
      }
      if (mode === 'create') {
        const res = await fetch(`/api/v1/public/invites/${token}/accept`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, password }),
        });
        if (!res.ok) {
          const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string; code?: string } | null;
          if (problem?.code === 'account_exists' || res.status === 409) {
            setMode('login');
            throw new Error(problem?.detail ?? 'Já tens conta: entra com a tua palavra-passe.');
          }
          throw new Error(problem?.detail ?? problem?.title ?? 'Não foi possível aceitar o convite.');
        }
        await signIn();
        router.replace('/colaborador');
        router.refresh();
        return;
      }
      if (sessionEmail) await getSupabaseBrowserClient().auth.signOut();
      await signIn();
      await claim();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6" noValidate>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Field label="Email">
        <Input value={email} readOnly disabled />
      </Field>
      {sameAccount ? (
        <p className="text-sm text-muted">Já tens a sessão aberta com este email.</p>
      ) : mode === 'create' ? (
        <>
          <Field label="O teu nome" required>
            <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Escolhe uma palavra-passe" required hint="Pelo menos 8 caracteres.">
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      ) : (
        <Field label="Palavra-passe" required>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      )}
      <Button type="submit" loading={busy} className="w-full">
        {sameAccount ? 'Aceitar o convite' : mode === 'create' ? 'Criar conta e aceitar' : 'Entrar e aceitar'}
      </Button>
      {!sameAccount ? (
        <button
          type="button"
          onClick={() => setMode(mode === 'create' ? 'login' : 'create')}
          className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          {mode === 'create' ? 'Já tenho conta' : 'Ainda não tenho conta'}
        </button>
      ) : null}
    </form>
  );
}
