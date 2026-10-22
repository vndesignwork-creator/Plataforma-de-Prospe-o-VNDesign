'use client';

/**
 * Segurança da conta: verificação em dois passos (código de uma app de
 * autenticação, TOTP do Supabase) e as sessões abertas noutros aparelhos.
 */
import { formatDateTime, type UserSession } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, MonitorSmartphone, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type Enrolling = { factorId: string; qr: string; secret: string };

export function TwoFactorCard() {
  const supabase = getSupabaseBrowserClient();
  const qc = useQueryClient();
  const { data: enabledData } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => !!(await supabase.auth.mfa.listFactors()).data?.totp.some((f) => f.status === 'verified'),
  });
  const enabled = enabledData ?? null;
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['mfa-factors'] });

  async function start() {
    setBusy(true);
    try {
      // Tentativas anteriores por acabar ocupam o nome: apagam-se primeiro.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `VNDesign Leads ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) throw new Error(error?.message ?? 'Sem resposta');
      setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } catch {
      toast.error('Não foi possível ligar a verificação. Tenta novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return toast.error('O código tem 6 dígitos.');
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: digits });
    setBusy(false);
    if (error) return toast.error('Código errado ou expirado. Tenta o código seguinte.');
    setEnrolling(null);
    toast.success('Verificação em dois passos ligada. A partir de agora, o login pede o código.');
    await refresh();
  }

  async function disable() {
    setBusy(true);
    const { data } = await supabase.auth.mfa.listFactors();
    let failed = false;
    for (const f of data?.all ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) failed = true;
    }
    setBusy(false);
    setConfirmOff(false);
    if (failed) toast.error('Não foi possível desligar. Sai e volta a entrar com o código, e tenta de novo.');
    else toast.success('Verificação em dois passos desligada.');
    await refresh();
  }

  return (
    <Card id="dois-passos">
      <CardHeader
        title="Verificação em dois passos"
        description="Além da palavra-passe, o login pede um código da app de autenticação do telemóvel."
        actions={enabled ? <Badge tone="success">Ligada</Badge> : enabled === false ? <Badge>Desligada</Badge> : null}
      />
      <div className="flex flex-col gap-3 p-4 text-sm">
        {enabled === null ? <Skeleton className="h-10" /> : null}
        {enabled === false && !enrolling ? (
          <>
            <p className="text-muted">
              Instala uma app de autenticação no telemóvel (Google Authenticator, Microsoft Authenticator ou 1Password) e liga a
              verificação. Mesmo que alguém descubra a palavra-passe, não entra sem o teu telemóvel.
            </p>
            <Button className="self-start" onClick={start} loading={busy}>
              <ShieldCheck className="h-4 w-4" aria-hidden /> Ligar a verificação
            </Button>
          </>
        ) : null}
        {enrolling ? (
          <form onSubmit={confirm} className="flex flex-col gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Na app de autenticação, carrega em “+” e lê este código QR.</li>
              <li>Escreve aqui o código de 6 dígitos que aparece na app.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- código QR em SVG (data URI) */}
              <img src={enrolling.qr} alt="Código QR para a app de autenticação" width={176} height={176} className="rounded-lg bg-white p-2" />
              <p className="max-w-xs text-xs text-muted">
                Sem câmara? Escreve esta chave na app: <code className="block break-all rounded bg-surface-2 px-2 py-1 text-fg select-all">{enrolling.secret}</code>
              </p>
            </div>
            <Field label="Código da app" required>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="w-40 tabular tracking-widest" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                Confirmar e ligar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEnrolling(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
        {enabled ? (
          confirmOff ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Desligar a verificação em dois passos?</span>
              <Button size="sm" variant="danger" onClick={disable} loading={busy}>
                Sim, desligar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>
                Não
              </Button>
            </div>
          ) : (
            <>
              <p className="text-muted">Ao entrar num aparelho novo, depois da palavra-passe pedimos o código da app.</p>
              <Button size="sm" variant="outline" className="self-start" onClick={() => setConfirmOff(true)}>
                <ShieldOff className="h-3.5 w-3.5" aria-hidden /> Desligar
              </Button>
            </>
          )
        ) : null}
      </div>
    </Card>
  );
}

export function SessionsCard() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: () => api<{ data: UserSession[] }>('/me/sessions').then((r) => r.data),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const others = (data ?? []).filter((s) => !s.current);
  const shown = all ? (data ?? []) : (data ?? []).slice(0, 6);

  async function end(id: string) {
    setBusy(id);
    try {
      await api(`/me/sessions/${id}`, { method: 'DELETE' });
      toast.success('Sessão terminada. Esse aparelho deixa de entrar em, no máximo, 1 hora.');
      void qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function endOthers() {
    setBusy('others');
    const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut({ scope: 'others' });
    setBusy(null);
    if (signOutError) return toast.error('Não foi possível terminar as outras sessões.');
    toast.success('As outras sessões foram terminadas.');
    void qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
  }

  return (
    <Card id="sessoes">
      <CardHeader
        title="Sessões abertas"
        description="Os aparelhos onde a tua conta está aberta. Se não reconheces algum, termina-o e muda a palavra-passe."
        actions={
          others.length ? (
            <Button size="sm" variant="outline" onClick={endOthers} loading={busy === 'others'}>
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Terminar as outras
            </Button>
          ) : null
        }
      />
      {isLoading ? (
        <div className="p-4">
          <Skeleton className="h-12" />
        </div>
      ) : error ? (
        <p className="p-4 text-sm text-muted">Não foi possível carregar as sessões.</p>
      ) : (
        <ul className="divide-y divide-border" aria-label="Sessões abertas">
          {shown.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <MonitorSmartphone className="h-5 w-5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {s.device}
                  {s.current ? <Badge tone="accent">Este aparelho</Badge> : null}
                  {s.verified ? <Badge tone="success">Com código</Badge> : null}
                </span>
                <span className="block text-xs text-muted">
                  {[s.ip, s.last_active_at ? `ativa a ${formatDateTime(s.last_active_at)}` : null, `desde ${formatDateTime(s.created_at)}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              {!s.current ? (
                <Button size="sm" variant="ghost" onClick={() => end(s.id)} loading={busy === s.id}>
                  Terminar
                </Button>
              ) : null}
            </li>
          ))}
          {(data?.length ?? 0) > 6 ? (
            <li className="px-4 py-2">
              <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
                {all ? 'Mostrar menos' : `Ver todas (${data!.length})`}
              </Button>
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}
