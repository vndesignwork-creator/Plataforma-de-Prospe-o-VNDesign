'use client';

/**
 * Definições → Email de envio: "Os teus emails chegam à caixa de entrada?" — verifica o SPF,
 * o DKIM, o DMARC e o MX do domínio de envio e diz, em português, o que pôr no DNS.
 */
import type { DeliverabilityReport, DeliverabilityStatus } from '@vndesign/core';
import { formatDateTime } from '@vndesign/core';
import { AlertTriangle, CheckCircle2, Copy, HelpCircle, ShieldCheck, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useMailAccount } from '@/lib/queries';
import { cn } from '@/lib/utils';

const ICON: Record<DeliverabilityStatus, typeof CheckCircle2> = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle, unknown: HelpCircle };
const TONE: Record<DeliverabilityStatus, string> = { ok: 'text-success', warn: 'text-warning', fail: 'text-danger', unknown: 'text-muted' };
const SUMMARY: Record<DeliverabilityStatus, string> = {
  ok: 'Tudo certo: o teu domínio está pronto para enviar.',
  warn: 'Quase: falta pouco para os emails chegarem melhor.',
  fail: 'Há problemas: os emails podem ir parar ao spam.',
  unknown: 'Não foi possível verificar tudo agora.',
};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado.');
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

export function DeliverabilityCard() {
  const { data: account } = useMailAccount();
  const [report, setReport] = useState<DeliverabilityReport | null>(null);
  const [selector, setSelector] = useState('');
  const [busy, setBusy] = useState(false);

  async function check(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const { data } = await api<{ data: DeliverabilityReport }>('/mail-account/deliverability', { query: selector.trim() ? { selector: selector.trim() } : {} });
      setReport(data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Só com o email de envio ligado (é o domínio dele que se verifica).
  if (!account) return null;
  return (
    <Card className="mt-5">
      <CardHeader
        title="Os teus emails chegam à caixa de entrada?"
        description="Verifica a configuração do teu domínio (SPF, DKIM e DMARC). Sem ela, o Gmail e o Outlook desconfiam e põem os emails no spam."
        actions={
          report ? (
            <Badge tone={report.status === 'ok' ? 'success' : report.status === 'fail' ? 'danger' : 'warning'}>
              {report.status === 'ok' ? 'Pronto' : report.status === 'fail' ? 'Por corrigir' : 'A melhorar'}
            </Badge>
          ) : null
        }
      />
      <div className="flex flex-col gap-4 px-4 py-4">
        <form onSubmit={check} className="flex flex-wrap items-end gap-2">
          <Button type="submit" loading={busy}>
            <ShieldCheck className="h-4 w-4" aria-hidden /> {report ? 'Verificar outra vez' : 'Verificar o domínio'}
          </Button>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            Seletor DKIM (opcional)
            <Input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="ex.: hostingermail-a" className="h-9 w-48" aria-label="Seletor DKIM (opcional)" />
          </label>
        </form>
        {report ? (
          <>
            <p className={cn('text-sm font-medium', TONE[report.status])} role="status">
              {SUMMARY[report.status]} <span className="font-normal text-muted">· {report.domain} · {formatDateTime(report.checked_at)}</span>
            </p>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label="Verificações do domínio">
              {report.checks.map((c) => {
                const Icon = ICON[c.status];
                return (
                  <li key={c.key} className="flex gap-3 px-3 py-3 text-sm">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[c.status])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.label}</p>
                      <p className="text-muted">{c.summary}</p>
                      {c.fix ? <p className="mt-1">{c.fix}</p> : null}
                      {c.record ? (
                        <div className="mt-2 flex flex-col gap-1 rounded-md bg-surface-2 p-2 text-xs">
                          <span>
                            <span className="text-muted">Tipo:</span> {c.record.type} · <span className="text-muted">Nome:</span> <code>{c.record.name}</code>
                          </span>
                          <span className="flex items-start gap-2">
                            <code className="min-w-0 flex-1 break-all">{c.record.value}</code>
                            <button type="button" onClick={() => void copy(c.record!.value)} className="shrink-0 rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Copiar o registo ${c.label}`}>
                              <Copy className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </span>
                        </div>
                      ) : null}
                      {c.found.length ? (
                        <details className="mt-1 text-xs text-muted">
                          <summary className="cursor-pointer">O que está no DNS</summary>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {c.found.map((f) => (
                              <li key={f}>
                                <code className="break-all">{f}</code>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {report.status !== 'ok' && !report.managed ? (
              <p className="text-xs text-muted">As alterações no DNS podem demorar até umas horas a aparecer. Depois, carrega em “Verificar outra vez”.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}
