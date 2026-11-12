'use client';

/**
 * O formulário da página "Analisar o meu site grátis": confirma se o site abre, guarda de
 * onde veio o pedido (página e campanha), protege com o Turnstile (se ligado) e, depois de
 * enviar, mostra logo um resumo do resultado (o PDF completo segue por email).
 */
import type { FreeAuditSummary } from '@vndesign/core';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Errors = Record<string, string[]>;
type Tone = 'good' | 'warn' | 'bad' | 'none';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'expired-callback'?: () => void; theme?: string; language?: string }) => string; reset: (id?: string) => void };
  }
}

const TONE: Record<Tone, string> = { good: 'text-success', warn: 'text-warning', bad: 'text-danger', none: 'text-muted' };

/** A página e a campanha (UTM) de onde veio o visitante. */
function sourceFields(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      const v = params.get(key);
      if (v) out[key] = v.slice(0, 150);
    }
    // Dentro de uma moldura, a página é a do site (o referrer); fora, esta.
    const inFrame = window.parent !== window;
    out.page = (inFrame && document.referrer ? document.referrer : window.location.href).slice(0, 500);
    if (!inFrame && document.referrer) out.referrer = document.referrer.slice(0, 500);
  } catch {
    // sem acesso: segue sem origem
  }
  return out;
}

function Result({ summary }: { summary: FreeAuditSummary }) {
  const rows = [
    { label: 'Velocidade no telemóvel', value: summary.speed.score != null ? `${summary.speed.score}/100 · ${summary.speed.label}` : summary.speed.label, tone: summary.speed.tone },
    { label: 'Telemóvel', value: summary.mobile.label, tone: summary.mobile.tone },
    { label: 'Segurança', value: summary.security.label, tone: summary.security.tone },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">O primeiro resultado:</p>
      <dl className="grid gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className={cn('text-sm font-semibold', TONE[r.tone])}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {summary.issues.length ? (
        <div className="text-sm">
          <p className="mb-1 font-medium">O que mais pesa:</p>
          <ul className="ml-4 list-disc space-y-0.5 text-muted">
            {summary.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-muted">O relatório completo, com o que fazer em cada ponto, segue em PDF para o seu email.</p>
    </div>
  );
}

/** Campos transparentes com um contorno fino na cor do texto (como os formulários de um site). */
const FIELD = 'h-11 rounded-xl border-fg/45 bg-transparent hover:border-fg/70';

export function FreeAuditForm({ token, brand, turnstileSiteKey, stretch = false }: { token: string; brand: string; turnstileSiteKey: string | null; stretch?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [summary, setSummary] = useState<FreeAuditSummary | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [siteWarning, setSiteWarning] = useState<string | null>(null);
  const checked = useRef<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileToken = useRef<string | null>(null);
  const turnstileId = useRef<string | null>(null);
  const api = `/api/v1/public/free-audit/${token}`;

  // Cloudflare Turnstile (só se o dono o ligou).
  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;
    const el = turnstileRef.current;
    const render = () => {
      if (!window.turnstile || turnstileId.current) return;
      turnstileId.current = window.turnstile.render(el, {
        sitekey: turnstileSiteKey,
        language: 'pt-PT',
        callback: (t) => (turnstileToken.current = t),
        'expired-callback': () => (turnstileToken.current = null),
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
  }, [turnstileSiteKey]);

  /** "O site abre?" (uma vez por endereço). */
  async function checkSite(value: string): Promise<boolean> {
    const url = value.trim();
    if (!url || checked.current === url) return !siteWarning;
    checked.current = url;
    try {
      const res = await fetch(`${api}/verificar-site?url=${encodeURIComponent(url)}`);
      const data = (await res.json().catch(() => null)) as { ok: boolean; message: string | null } | null;
      setSiteWarning(data && !data.ok ? data.message : null);
      return !!data?.ok;
    } catch {
      setSiteWarning(null);
      return true;
    }
  }

  // Depois de enviar: o resumo aparece quando a análise acaba (até ~2 minutos).
  async function poll(request: string) {
    setWaiting(true);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, i < 5 ? 3000 : 5000));
      try {
        const res = await fetch(`${api}/estado/${encodeURIComponent(request)}`);
        const data = (await res.json().catch(() => null)) as { state?: string; summary?: FreeAuditSummary | null } | null;
        if (data?.state === 'done' && data.summary) {
          setSummary(data.summary);
          break;
        }
        if (data?.state === 'failed' || !res.ok) break;
      } catch {
        break;
      }
    }
    setWaiting(false);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const website = String(form.get('website') ?? '');
    setError(null);
    setErrors({});
    // Primeira vez com um site que não abre: avisa e deixa enviar na mesma à segunda.
    if (checked.current !== website.trim()) {
      setBusy(true);
      const ok = await checkSite(website);
      setBusy(false);
      if (!ok) return;
    }
    if (turnstileSiteKey && !turnstileToken.current) {
      setError('Confirme que não é um robô (a caixa por cima do botão).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          website,
          email: form.get('email'),
          name: form.get('name') || undefined,
          company: form.get('company') || undefined,
          consent: form.get('consent') === 'on',
          _gotcha: form.get('_gotcha') || undefined,
          source: sourceFields(),
          ...(turnstileToken.current ? { turnstile: turnstileToken.current } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; message: string; request?: string | null; errors?: Errors | null } | null;
      if (res.ok && data?.ok) {
        setDone(data.message);
        if (data.request) void poll(data.request);
      } else {
        setError(data?.message ?? 'Não foi possível enviar. Tente outra vez.');
        setErrors(data?.errors ?? {});
        if (turnstileId.current) window.turnstile?.reset(turnstileId.current);
        turnstileToken.current = null;
      }
    } catch {
      setError('Sem ligação. Tente outra vez.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className={cn('flex flex-col gap-4 rounded-xl border border-border px-4 py-4 sm:px-5', stretch && 'lg:flex-1 lg:justify-center')}>
        <p className="flex items-start gap-2 font-medium text-success">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {done}
        </p>
        {summary ? <Result summary={summary} /> : null}
        {!summary && waiting ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A analisar o site… o primeiro resultado aparece aqui dentro de instantes.
          </p>
        ) : null}
      </div>
    );
  }
  const err = (k: string) => errors[k]?.[0];
  const siteError = err('website') ?? siteWarning;
  return (
    // Ao lado do texto de persuasão, a caixa estica até à altura dele (as duas colunas alinham).
    // Sem caixa à volta (sem fundo branco ou preto): o formulário fica sobre o fundo da página, como num site.
    <form onSubmit={submit} noValidate className={cn('flex flex-col gap-4', stretch && 'lg:flex-1 lg:justify-center')}>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Endereço do site *</span>
        <Input
          className={FIELD}
          name="website"
          required
          placeholder="www.o-meu-negocio.pt"
          autoComplete="url"
          inputMode="url"
          aria-invalid={siteError ? true : undefined}
          onBlur={(e) => void checkSite(e.currentTarget.value)}
          onChange={() => siteWarning && setSiteWarning(null)}
        />
        {siteError ? <span className={cn('text-xs', err('website') ? 'text-danger' : 'text-warning')}>{siteError}</span> : null}
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Email para receber a análise *</span>
        <Input className={FIELD} name="email" type="email" required placeholder="nome@exemplo.pt" autoComplete="email" aria-invalid={err('email') ? true : undefined} />
        {err('email') ? <span className="text-xs text-danger">{err('email')}</span> : null}
      </label>
      <div className="grid gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">O seu nome</span>
          <Input className={FIELD} name="name" autoComplete="name" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Nome do negócio</span>
          <Input className={FIELD} name="company" autoComplete="organization" />
        </label>
      </div>
      {/* Campo escondido para robôs. */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <label className="flex items-start gap-2.5 text-sm">
        {/* Caixa com o aspeto da página (não a branca de origem do browser). */}
        <input
          type="checkbox"
          name="consent"
          className="peer mt-0.5 grid h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none place-content-center rounded-[5px] border border-fg/45 bg-transparent transition-colors checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent before:hidden before:h-2.5 before:w-1.5 before:translate-y-[-1px] before:rotate-45 before:border-r-2 before:border-b-2 before:border-accent-fg before:content-[''] checked:before:block"
        />
        <span>
          Aceito que {brand} me envie a análise e me contacte sobre ela. Pode pedir para apagar os seus dados a qualquer momento.
          {err('consent') ? <span className="block text-xs text-danger">{err('consent')}</span> : null}
        </span>
      </label>
      {turnstileSiteKey ? <div ref={turnstileRef} className="min-h-[65px]" /> : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="w-full">
        {siteWarning ? 'Enviar na mesma' : 'Analisar o meu site'}
      </Button>
      <a href={`${api}/exemplo`} target="_blank" rel="noopener" className="inline-flex w-fit items-center gap-1.5 self-center text-sm text-muted underline-offset-2 hover:text-fg hover:underline">
        <FileText className="h-4 w-4" aria-hidden /> Ver um exemplo do relatório (PDF)
      </a>
    </form>
  );
}
