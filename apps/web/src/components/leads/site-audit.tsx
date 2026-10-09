'use client';

import {
  AUDIT_SEVERITY_LABELS,
  MOBILE_STATUS_META,
  formatDate,
  formatDateTime,
  type Lead,
  type SiteAudit,
} from '@vndesign/core';
import { AlertTriangle, CheckCircle2, Gauge, History, Info, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useApplyAudit, useAudits, useRunAudit } from '@/lib/queries';
import { displayHost } from '@/lib/utils';
import { PageSpeedScore } from './badges';

const seconds = (ms: unknown) =>
  typeof ms !== 'number'
    ? null
    : ms < 1000
      ? `${Math.round(ms)} ms`
      : `${(ms / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} s`;

function Check({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const Icon = ok === null ? Info : ok ? CheckCircle2 : XCircle;
  const tone = ok === null ? 'text-muted' : ok ? 'text-success' : 'text-danger';
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
      <span className="sr-only">{ok === null ? 'Não verificado: ' : ok ? 'OK: ' : 'Problema: '}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function AuditResult({ audit, lead }: { audit: SiteAudit; lead: Lead }) {
  const apply = useApplyAudit(lead.id);
  const canPagespeed = audit.pagespeed_mobile !== null;
  const canMobile = !!audit.suggested_mobile && audit.suggested_mobile !== 'desconhecido';
  const canProblems = !!audit.suggested_problems;
  const [fields, setFields] = useState(() => ({ pagespeed: canPagespeed, mobile: canMobile, problems: canProblems }));
  const [mode, setMode] = useState<'replace' | 'append'>(lead.problems ? 'append' : 'replace');
  const m = audit.metrics as Record<string, unknown>;
  const ownSite = !audit.issues.some((i) => i.code === 'no_own_site');
  const reachable = audit.final_url !== null;

  async function onApply() {
    const chosen = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => fields[k]);
    if (!chosen.length) return;
    try {
      await apply.mutateAsync({ auditId: audit.id, fields: chosen, problems_mode: mode });
      toast.success('Resultados aplicados ao lead.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Análise de {formatDateTime(audit.created_at)} ·{' '}
        <a href={audit.final_url ?? audit.url} target="_blank" rel="noreferrer noopener" className="break-all underline">
          {displayHost(audit.final_url ?? audit.url)}
        </a>
        {audit.http_status ? ` · HTTP ${audit.http_status}` : null}
        {audit.response_ms !== null ? ` · resposta em ${seconds(audit.response_ms)}` : null}
      </p>

      {ownSite && reachable ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          <Check ok={audit.https}>
            {audit.https ? 'Usa HTTPS' : 'Sem HTTPS'}
          </Check>
          <Check ok={audit.https ? audit.ssl_valid : null}>
            {audit.https
              ? audit.ssl_valid
                ? `Certificado válido${audit.ssl_issuer ? ` (${audit.ssl_issuer})` : ''}${
                    audit.ssl_expires_at ? ` até ${formatDate(audit.ssl_expires_at.slice(0, 10))}` : ''
                  }`
                : (audit.ssl_error ?? 'Certificado inválido')
              : 'Certificado SSL: não aplicável'}
          </Check>
          <Check ok={audit.has_viewport}>
            {audit.has_viewport === null
              ? 'Adaptação a telemóvel: não verificado'
              : audit.has_viewport
                ? audit.zoom_blocked
                  ? 'Adaptado a telemóvel (mas bloqueia o zoom)'
                  : 'Adaptado a telemóvel'
                : 'Não adaptado a telemóvel'}
          </Check>
          <Check ok={audit.pagespeed_mobile === null ? null : audit.pagespeed_mobile >= 50}>
            {audit.pagespeed_mobile !== null ? (
              <>
                PageSpeed mobile <PageSpeedScore value={audit.pagespeed_mobile} />
                {seconds(m.lcp_ms) ? <span className="text-muted"> · LCP {seconds(m.lcp_ms)}</span> : null}
              </>
            ) : (
              <span className="text-muted">
                PageSpeed: {typeof m.pagespeed_error === 'string' ? m.pagespeed_error : 'não calculado'}
              </span>
            )}
          </Check>
          <Check ok={audit.title ? true : false}>
            {audit.title ? <>Título: “{audit.title}”</> : 'Sem título'}
          </Check>
          <Check ok={audit.meta_description ? true : false}>
            {audit.meta_description ? 'Tem meta descrição' : 'Sem meta descrição'}
          </Check>
          <Check ok={null}>
            Plataforma: {audit.cms ?? 'não identificada'}
            {audit.copyright_year ? ` · © ${audit.copyright_year}` : ''}
          </Check>
        </ul>
      ) : null}

      {audit.issues.length ? (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">Problemas encontrados ({audit.issues.length})</h4>
          <ul className="flex flex-col gap-1.5">
            {audit.issues.map((issue) => (
              <li key={issue.code} className="flex items-start gap-2 text-sm">
                <Badge tone={issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warning' : 'neutral'} className="shrink-0">
                  {AUDIT_SEVERITY_LABELS[issue.severity]}
                </Badge>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
          {audit.error ? <p className="mt-1.5 text-xs text-muted">{audit.error}</p> : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Não foram encontrados problemas. Bom argumento para outro ângulo!
        </p>
      )}

      {canPagespeed || canMobile || canProblems ? (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Aplicar ao lead</legend>
          <div className="flex flex-col gap-2 text-sm">
            {canPagespeed ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fields.pagespeed}
                  onChange={(e) => setFields((f) => ({ ...f, pagespeed: e.target.checked }))}
                  className="accent-[var(--accent)]"
                />
                PageSpeed: <strong className="tabular">{audit.pagespeed_mobile}</strong>
                {lead.pagespeed !== null ? <span className="text-muted">(atual: {lead.pagespeed})</span> : null}
              </label>
            ) : null}
            {canMobile ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={fields.mobile}
                  onChange={(e) => setFields((f) => ({ ...f, mobile: e.target.checked }))}
                  className="accent-[var(--accent)]"
                />
                Mobile?: <strong>{MOBILE_STATUS_META[audit.suggested_mobile!].label}</strong>
                <span className="text-muted">(atual: {MOBILE_STATUS_META[lead.mobile].label})</span>
              </label>
            ) : null}
            {canProblems ? (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={fields.problems}
                    onChange={(e) => setFields((f) => ({ ...f, problems: e.target.checked }))}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    Problemas: <span className="text-muted">{audit.suggested_problems}</span>
                  </span>
                </label>
                {fields.problems && lead.problems ? (
                  <div role="radiogroup" aria-label="Problemas já preenchidos" className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`mode-${audit.id}`} checked={mode === 'append'} onChange={() => setMode('append')} className="accent-[var(--accent)]" />
                      Acrescentar aos atuais
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`mode-${audit.id}`} checked={mode === 'replace'} onChange={() => setMode('replace')} className="accent-[var(--accent)]" />
                      Substituir
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <Button
                size="sm"
                onClick={onApply}
                loading={apply.isPending}
                disabled={!fields.pagespeed && !fields.mobile && !fields.problems}
              >
                Aplicar ao lead
              </Button>
            </div>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

/** Secção "Análise automática" dentro do cartão "Diagnóstico do site". */
export function SiteAuditPanel({ lead }: { lead: Lead }) {
  const { data: audits, isLoading } = useAudits(lead.id);
  const run = useRunAudit(lead.id);
  const [url, setUrl] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = audits?.find((a) => a.id === selectedId) ?? audits?.[0] ?? null;

  async function onRun(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      const audit = await run.mutateAsync(lead.website ? {} : { url: url.trim() });
      setSelectedId(audit.id);
      toast.success(
        audit.issues.length ? `Análise concluída: ${audit.issues.length} problema(s).` : 'Análise concluída: sem problemas.',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby="audit-title" className="border-t border-border px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="audit-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-accent-text" aria-hidden />
          Análise automática do site
        </h3>
        {lead.website ? (
          <Button size="sm" variant="outline" onClick={() => onRun()} loading={run.isPending} disabled={!!lead.anonymized_at}>
            {audits?.length ? 'Analisar outra vez' : 'Analisar site'}
          </Button>
        ) : null}
      </div>

      {!lead.website && !lead.anonymized_at ? (
        <form onSubmit={onRun} className="mb-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="audit-url" className="sr-only">
            Endereço a analisar
          </label>
          <Input
            id="audit-url"
            type="url"
            inputMode="url"
            placeholder="https://exemplo.pt"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <Button type="submit" size="sm" loading={run.isPending}>
            Analisar site
          </Button>
        </form>
      ) : null}

      <p aria-live="polite" className="text-sm text-muted">
        {run.isPending ? 'A analisar o site… (HTTPS, telemóvel, SEO e PageSpeed — pode levar até 1 minuto)' : ''}
      </p>

      {isLoading ? <p className="text-sm text-muted">A carregar…</p> : null}
      {!isLoading && !audits?.length && !run.isPending ? (
        <p className="text-sm text-muted">
          Verifica HTTPS e certificado, adaptação a telemóvel, título e descrição, plataforma, ano do copyright e
          PageSpeed — e preenche os problemas por ti.
        </p>
      ) : null}

      {selected ? <AuditResult key={selected.id} audit={selected} lead={lead} /> : null}

      {audits && audits.length > 1 ? (
        <details className="mt-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-muted">
            <History className="h-4 w-4" aria-hidden /> Histórico ({audits.length})
          </summary>
          <ul className="mt-2 divide-y divide-border">
            {audits.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  aria-current={selected?.id === a.id ? 'true' : undefined}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 aria-[current=true]:bg-surface-2"
                >
                  <span className="tabular">{formatDateTime(a.created_at)}</span>
                  <span className="flex items-center gap-3 text-muted">
                    {a.pagespeed_mobile !== null ? (
                      <span>
                        PageSpeed <PageSpeedScore value={a.pagespeed_mobile} />
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {a.issues.length}
                      <span className="sr-only">problemas</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
