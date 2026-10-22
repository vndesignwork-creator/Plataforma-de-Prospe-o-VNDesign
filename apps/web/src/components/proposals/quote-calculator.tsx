'use client';

/**
 * Calculadora de orçamento: escolhe os pacotes e os extras (páginas, idiomas,
 * urgência…) e vê logo o total, as horas previstas (pelos teus projetos
 * anteriores) e quanto ganhas por hora. Dá para guardar como valor estimado ou
 * criar já a proposta.
 */
import {
  computeQuote,
  formatCurrency,
  isRecurringPackage,
  leadPath,
  parseEuroAmount,
  quoteProposalItems,
  suggestPackages,
  suggestProposalIntro,
  type Lead,
  type Proposal,
  type QuoteLine,
} from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, FilePlus2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { usePackages, useProfitability, useUpdateLead, type SettingsWithMail } from '@/lib/queries';
import { cn } from '@/lib/utils';

const hoursLabel = (h: number) => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;

export function QuoteCalculatorDialog({ lead, settings, onClose }: { lead: Lead; settings: SettingsWithMail; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: packages } = usePackages();
  const { data: profitability } = useProfitability(settings.features.projects && settings.features.time_tracking);
  const updateLead = useUpdateLead(lead.id);
  const { hourly_target: target, extras } = settings.quote;

  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [discount, setDiscount] = useState('');
  const [hoursOverride, setHoursOverride] = useState('');
  const [busy, setBusy] = useState<'value' | 'proposal' | null>(null);

  const active = (packages ?? []).filter((p) => !p.archived_at);
  // Começa com os pacotes dos serviços de interesse do lead.
  const selected = picked ?? new Set(suggestPackages(active, lead.services ?? []).map((p) => p.id));

  // Horas médias por projeto de cada serviço (dos projetos com horas registadas).
  const avgHours = new Map(
    (profitability?.by_service ?? []).filter((s) => s.projects > 0 && s.minutes > 0).map((s) => [s.service, s.minutes / s.projects / 60]),
  );

  const lines: QuoteLine[] = [
    ...active
      .filter((p) => selected.has(p.id))
      .map((p) => ({
        name: p.name,
        price: p.price,
        quantity: 1,
        recurring: isRecurringPackage(p),
        hours: p.service && avgHours.has(p.service) ? avgHours.get(p.service)! : null,
        package_id: p.id,
        description: p.description,
        features: p.features,
      })),
    ...extras.flatMap((e, i) => {
      const n = Math.max(0, Math.round(Number(qty[i] ?? 0) || 0));
      if (e.kind !== 'fixed' || !n) return [];
      return [{ name: e.unit && n > 1 ? `${e.name} (${n} × ${e.unit})` : e.name, price: e.price, quantity: n, recurring: e.recurring, hours: e.hours * n }];
    }),
  ];
  const percents = extras.flatMap((e, i) => (e.kind === 'percent' && qty[i] === '1' ? [{ name: e.name, percent: e.price }] : []));
  const manualHours = hoursOverride.trim() ? parseEuroAmount(hoursOverride) : null;
  const result = computeQuote(lines, percents, parseEuroAmount(discount) ?? 0, target, manualHours);
  const below = result.rate !== null && target !== null && result.rate < target;

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  }

  async function saveValue() {
    setBusy('value');
    try {
      await updateLead.mutateAsync({ estimated_value: result.total });
      toast.success(`Valor estimado: ${formatCurrency(result.total)}.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function createProposal() {
    setBusy('proposal');
    try {
      const { data } = await api<{ data: Proposal }>(`/leads/${lead.id}/proposals`, {
        method: 'POST',
        body: {
          title: `Proposta — ${lead.company_name}${lead.project_title ? ` · ${lead.project_title}` : ''}`,
          intro: suggestProposalIntro({
            companyName: lead.company_name,
            contactName: lead.contact_name,
            website: lead.website,
            problems: lead.problems,
            approachAngle: lead.approach_angle,
          }),
          items: quoteProposalItems(lines, percents),
          discount: result.discount,
        },
      });
      void qc.invalidateQueries({ queryKey: ['proposals', lead.id] });
      toast.success(`Proposta ${data.code} criada a partir da calculadora.`);
      router.push(leadPath(lead, `/propostas/${data.id}`));
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(null);
    }
  }

  const empty = !lines.length;
  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Calcular orçamento"
      description="Pacotes + extras → total, horas previstas e quanto ganhas por hora."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="outline" onClick={() => void saveValue()} loading={busy === 'value'} disabled={empty || !!busy}>
            <Save className="h-4 w-4" aria-hidden /> Guardar como valor estimado
          </Button>
          <Button onClick={() => void createProposal()} loading={busy === 'proposal'} disabled={empty || !!busy}>
            <FilePlus2 className="h-4 w-4" aria-hidden /> Criar proposta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Pacotes</legend>
          {active.length ? (
            active.map((p) => (
              <label key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="checkbox" className="h-4 w-4" checked={selected.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.service && avgHours.has(p.service) ? (
                  <span className="text-xs text-muted" title="Média dos teus projetos deste serviço">
                    ~{hoursLabel(avgHours.get(p.service)!)}
                  </span>
                ) : null}
                <span className="tabular shrink-0 text-right">
                  {formatCurrency(p.price, { decimals: false })}
                  {isRecurringPackage(p) ? '/mês' : ''}
                </span>
              </label>
            ))
          ) : (
            <p className="text-sm text-muted">Ainda não tens pacotes (Definições → Propostas).</p>
          )}
        </fieldset>

        {extras.length ? (
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Extras</legend>
            {extras.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-1 text-sm">
                {e.kind === 'percent' ? (
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={qty[i] === '1'}
                      onChange={(ev) => setQty({ ...qty, [i]: ev.target.checked ? '1' : '0' })}
                    />
                    <span className="truncate">{e.name}</span>
                  </label>
                ) : (
                  <>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      inputMode="numeric"
                      aria-label={`Quantidade: ${e.name}`}
                      className="h-8 w-16"
                      value={qty[i] ?? '0'}
                      onChange={(ev) => setQty({ ...qty, [i]: ev.target.value })}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {e.name}
                      {e.unit ? <span className="text-muted"> · por {e.unit}</span> : null}
                    </span>
                  </>
                )}
                <span className="tabular shrink-0 text-right text-muted">
                  {e.kind === 'percent' ? `+${e.price}%` : `${formatCurrency(e.price, { decimals: false })}${e.recurring ? '/mês' : ''}`}
                </span>
              </div>
            ))}
          </fieldset>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Field label="Desconto (€)" className="w-36">
            <Input inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="Horas previstas" hint="Vazio = estimativa automática." className="w-44">
            <Input
              inputMode="decimal"
              placeholder={result.hours !== null && manualHours === null ? String(result.hours).replace('.', ',') : 'ex.: 20'}
              value={hoursOverride}
              onChange={(e) => setHoursOverride(e.target.value)}
            />
          </Field>
        </div>

        <section aria-label="Resultado" className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-4 text-sm sm:grid-cols-4">
          <Stat label="Total" value={formatCurrency(result.total)} strong />
          <Stat label="Mensal" value={result.monthly ? `${formatCurrency(result.monthly)}/mês` : '—'} />
          <Stat label="Horas" value={result.hours !== null ? hoursLabel(result.hours) : '—'} />
          <Stat
            label="Por hora"
            value={result.rate !== null ? `${formatCurrency(result.rate)}/h` : '—'}
            tone={result.rate === null ? undefined : below ? 'warning' : 'success'}
          />
        </section>
        {result.hours === null ? (
          <p className="flex items-start gap-2 text-xs text-muted">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Sem horas para estimar: regista o tempo nos projetos (ou indica as horas previstas) para saberes quanto ganhas por hora.
          </p>
        ) : target !== null && result.suggested !== null ? (
          <p className={cn('text-sm', below ? 'text-warning' : 'text-muted')} role="status">
            {below
              ? `Abaixo do teu objetivo de ${formatCurrency(target)}/h: para lá chegares, cobra cerca de ${formatCurrency(result.suggested, { decimals: false })}.`
              : `Acima do teu objetivo de ${formatCurrency(target)}/h.`}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'success' | 'warning' }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn('tabular', strong && 'text-lg font-semibold', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning')}>{value}</span>
    </div>
  );
}
