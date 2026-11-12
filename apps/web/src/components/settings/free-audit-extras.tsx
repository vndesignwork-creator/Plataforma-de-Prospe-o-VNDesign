'use client';

/**
 * Definições → Formulário do site → Análise grátis: os números (pedidos, respostas, clientes
 * e de onde vieram), o follow-up automático e a proteção Cloudflare Turnstile.
 */
import { formatPercent, type FreeAuditFormStats } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useSettings } from '@/lib/queries';

/**
 * Por site, nos últimos 30 dias: quantas pessoas viram o formulário, quantos pedidos chegaram e a
 * percentagem — para perceber se uma mudança no texto, na imagem ou no lugar traz mais pedidos.
 */
function FormViews() {
  const { data, isLoading } = useQuery({
    queryKey: ['free-audit-form-stats'],
    queryFn: () => api<{ data: FreeAuditFormStats }>('/free-audit/form-stats').then((r) => r.data),
  });
  const platform = typeof window === 'undefined' ? '' : window.location.hostname.replace(/^www\./, '');
  const label = (site: string) => (site === platform ? 'Página da plataforma (/analise)' : site === 'sem site' ? 'Sem site conhecido' : site);
  return (
    <section aria-label="Vistas e pedidos por site" className="flex flex-col gap-2">
      <h3 className="font-medium">Vistas e pedidos (últimos 30 dias)</h3>
      {isLoading ? null : data?.sites.length ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Por site: pessoas que viram o formulário, pedidos e percentagem</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="pb-1 font-medium">Site</th>
              <th scope="col" className="pb-1 text-right font-medium">Viram</th>
              <th scope="col" className="pb-1 text-right font-medium">Pedidos</th>
              <th scope="col" className="pb-1 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((s) => (
              <tr key={s.site} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal break-all">
                  {label(s.site)}
                </th>
                <td className="py-1.5 text-right tabular-nums">{s.views || '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{s.requests}</td>
                <td className="py-1.5 text-right tabular-nums">{s.rate === null ? '—' : formatPercent(s.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted">Ainda sem vistas: cada pessoa que vê o formulário conta uma vez por dia (o plugin precisa da versão 1.10.0 ou mais recente).</p>
      )}
      <p className="text-xs text-muted">“Viram”: pessoas que chegaram a ver o formulário no ecrã (uma vez por dia cada).</p>
    </section>
  );
}

type Stats = { month: number; total: number; replied: number; clients: number; sources: { key: string; count: number }[] };

const FOLLOW_UP_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Desligado' },
  { value: 2, label: '2 dias depois' },
  { value: 3, label: '3 dias depois' },
  { value: 5, label: '5 dias depois' },
  { value: 7, label: '7 dias depois' },
];

export function FreeAuditExtras({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const fa = settings?.free_audit;
  const { data: stats } = useQuery({ queryKey: ['free-audit-stats'], queryFn: () => api<{ data: Stats }>('/free-audit/stats').then((r) => r.data) });
  const [siteKey, setSiteKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await api('/free-audit', { method: 'PATCH', body });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(done);
      setSiteKey('');
      setSecret('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!fa) return null;
  const turnstileOn = !!(fa.turnstile_site_key && fa.turnstile_secret);
  const rate = (n: number) => (stats && stats.total ? ` (${Math.round((n / stats.total) * 100)}%)` : '');
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <section aria-label="Números da análise grátis" className="flex flex-col gap-2">
        <h3 className="font-medium">Números</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Pedidos este mês', value: stats?.month ?? '—' },
            { label: 'Pedidos no total', value: stats?.total ?? '—' },
            { label: 'Responderam ou avançaram', value: stats ? `${stats.replied}${rate(stats.replied)}` : '—' },
            { label: 'Passaram a clientes', value: stats ? `${stats.clients}${rate(stats.clients)}` : '—' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        {stats?.sources.length ? (
          <p className="text-xs text-muted">
            De onde vieram: {stats.sources.map((s) => `${s.key === 'direto' ? 'direto / sem campanha' : s.key} (${s.count})`).join(' · ')}
          </p>
        ) : null}
      </section>

      <FormViews />

      <section aria-label="Follow-up automático" className="flex flex-col gap-1.5">
        <h3 className="font-medium">Follow-up automático</h3>
        <p className="text-muted">Quem recebeu a análise e não respondeu recebe um email curto (“Teve oportunidade de ver a análise?”), na mesma conversa. Só uma vez, e só a quem continua em “Respondeu”.</p>
        {/* A lista da plataforma (não a do sistema), encostada à direita. */}
        <Select
          aria-label="Quando enviar o follow-up"
          className="h-9 w-48 self-end"
          value={fa.follow_up_days ?? ''}
          disabled={!canEdit || busy}
          onChange={(e) => void save({ follow_up_days: e.target.value ? Number(e.target.value) : null }, 'Follow-up guardado.')}
        >
          {FOLLOW_UP_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ''}>
              {o.label}
            </option>
          ))}
        </Select>
      </section>

      <section aria-label="Proteção contra robôs" className="flex flex-col gap-1.5">
        <h3 className="inline-flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> Proteção contra robôs (Cloudflare Turnstile)
        </h3>
        <p className="text-muted">
          Já há um campo escondido para robôs e um limite de pedidos. Se mesmo assim chegarem pedidos falsos, liga o Turnstile (grátis): em dash.cloudflare.com → Turnstile → Adicionar
          site (o teu domínio), copia as duas chaves e cola-as aqui. Vale para a página, a moldura e o plugin.
        </p>
        {turnstileOn ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-success">Ligado</span>
            <span className="text-xs text-muted">
              Chave do site {fa.turnstile_site_key} · secreta {fa.turnstile_secret_hint ?? '…'}
            </span>
            {canEdit ? (
              <Button size="sm" variant="ghost" loading={busy} onClick={() => void save({ turnstile_site_key: null, turnstile_secret: null }, 'Turnstile desligado.')}>
                Desligar
              </Button>
            ) : null}
          </div>
        ) : canEdit ? (
          <div className="flex flex-wrap items-end justify-end gap-2 sm:justify-start" /* telemóvel: chaves a toda a largura, "Ligar" à direita */>
            <label className="flex w-full flex-col gap-1 text-xs sm:w-auto">
              Chave do site
              <Input value={siteKey} onChange={(e) => setSiteKey(e.target.value.trim())} placeholder="0x4AAAA…" className="w-full sm:w-56" />
            </label>
            <label className="flex w-full flex-col gap-1 text-xs sm:w-auto">
              Chave secreta
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value.trim())} placeholder="0x4AAAA…" className="w-full sm:w-56" autoComplete="off" />
            </label>
            <Button size="sm" loading={busy} disabled={!siteKey || !secret} onClick={() => void save({ turnstile_site_key: siteKey, turnstile_secret: secret }, 'Turnstile ligado.')}>
              Ligar
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Desligado.</p>
        )}
      </section>
    </div>
  );
}
