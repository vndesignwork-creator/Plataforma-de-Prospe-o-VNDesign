'use client';

/**
 * Gerador de leads: descreve que empresas procuras → o Claude pesquisa na
 * internet (1–3 minutos, em segundo plano) → revês a lista e escolhes quais
 * entram como leads (os sites são analisados a seguir).
 */
import { LEAD_GENERATION_LIMITS, type LeadCandidate, type LeadGenerationRun } from '@vndesign/core';
import { ExternalLink, Globe, History, Loader2, Mail, Phone, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { MultiSelectFilter } from '@/components/leads/multi-select';
import { ServiceChips, ServiceGlyph, useServiceCatalog } from '@/components/services/services';
import { errorMessage } from '@/lib/api-client';
import {
  useAddGeneratedLeads,
  useLeadGenerationRun,
  useLeadGenerationRuns,
  useSectors,
  useStartLeadGeneration,
} from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';

const COUNTS = [10, 15, 20, 30].filter((n) => n <= LEAD_GENERATION_LIMITS.maxResults);

const usd = (value: number | null) =>
  value === null ? null : value.toLocaleString('pt-PT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function SearchForm({ onStarted, busy }: { onStarted: (run: LeadGenerationRun) => void; busy: boolean }) {
  const start = useStartLeadGeneration();
  const { data: sectors } = useSectors();
  const catalog = useServiceCatalog();
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('Amadora');
  const [sectorId, setSectorId] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [count, setCount] = useState(15);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (query.trim().length < 3) {
      setError('Descreve que empresas procuras.');
      return;
    }
    try {
      const run = await start.mutateAsync({
        query: query.trim(),
        city: city.trim() || null,
        sector_id: sectorId || null,
        services,
        max_results: count,
      });
      onStarted(run);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Nova pesquisa"
        description="O Claude pesquisa na internet empresas reais que encaixam no pedido. Revês a lista antes de entrar algum lead."
      />
      <form onSubmit={submit} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
        <Field
          label="O que procuras?"
          required
          error={error ?? undefined}
          className="md:col-span-2"
          hint="Ex.: “restaurantes sem site ou com site antigo”, “clínicas dentárias com má imagem nas redes sociais”."
        >
          <Textarea rows={2} value={query} maxLength={500} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Field label="Zona" hint="Cidade ou concelho. Vazio = Portugal.">
          <Input value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Setor (opcional)">
          <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
            <option value="">Qualquer setor</option>
            {(sectors ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Serviços a propor</span>
          <MultiSelectFilter
            label={services.length ? 'Serviços' : 'Todos os serviços'}
            value={services}
            onChange={setServices}
            className="w-full"
            options={catalog.active.map((s) => ({
              value: s.key,
              label: `${s.label} · ${catalog.categoryLabel(s.category)}`,
              icon: <ServiceGlyph icon={s.icon} className="text-muted" />,
            }))}
          />
        </div>
        <Field label="Quantas empresas (no máximo)">
          <Select value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                Até {n}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
          <p className="mr-auto text-xs text-muted">
            Usa créditos da Anthropic: cerca de 0,20 $ a 1,50 $ por pesquisa (o custo real aparece no fim).
          </p>
          <Button type="submit" loading={start.isPending} disabled={busy}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Procurar com IA
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MatchBadge({ candidate }: { candidate: LeadCandidate }) {
  if (candidate.added_lead_id) {
    return (
      <Badge tone="success">
        <Link href={`/leads/${candidate.added_lead_id}`} className="hover:underline">
          Adicionado
        </Link>
      </Badge>
    );
  }
  const m = candidate.match;
  if (m.status === 'do_not_contact') return <Badge tone="danger">Não contactar</Badge>;
  if (m.status === 'duplicate' && m.lead_id) {
    return (
      <Badge tone="warning">
        <Link href={`/leads/${m.lead_id}`} className="hover:underline">
          Já existe{m.lead_number ? ` · #${m.lead_number}` : ''}
        </Link>
      </Badge>
    );
  }
  if (m.status === 'possible_duplicate') return <Badge tone="warning">Parecido com #{m.lead_number}</Badge>;
  return <Badge tone="accent">Novo</Badge>;
}

const selectable = (c: LeadCandidate) => !c.added_lead_id && (c.match.status === 'new' || c.match.status === 'possible_duplicate');

function Results({ run }: { run: LeadGenerationRun }) {
  const add = useAddGeneratedLeads(run.id);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(run.candidates.flatMap((c, i) => (c.match.status === 'new' && !c.added_lead_id ? [i] : []))),
  );
  const [audit, setAudit] = useState(true);
  const chosen = [...selected].filter((i) => run.candidates[i] && selectable(run.candidates[i]!));

  function toggle(index: number, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(index);
    else next.delete(index);
    setSelected(next);
  }

  async function onAdd() {
    try {
      const result = await add.mutateAsync({ indexes: chosen, audit });
      setSelected(new Set());
      const created = result.created.length;
      toast.success(
        `${created === 1 ? '1 lead criado' : `${created} leads criados`}${result.skipped.length ? ` · ${result.skipped.length} saltado(s)` : ''}.` +
          (result.audits ? ` A analisar ${result.audits === 1 ? '1 site' : `${result.audits} sites`} em segundo plano.` : ''),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (!run.candidates.length) {
    return <p className="p-4 text-center text-sm text-muted">Não encontrou empresas. Experimenta um pedido mais largo ou outra zona.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-border" aria-label="Empresas encontradas">
        {run.candidates.map((c, i) => {
          const can = selectable(c);
          return (
            <li key={i} className={cn('flex gap-3 px-4 py-3', !can && 'opacity-70')}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                aria-label={`Escolher ${c.company_name}`}
                checked={can && selected.has(i)}
                disabled={!can}
                onChange={(e) => toggle(i, e.target.checked)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{c.company_name}</span>
                  <MatchBadge candidate={c} />
                  {c.sector_name ? <span className="text-xs text-muted">{c.sector_name}</span> : null}
                  {c.city ? <span className="text-xs text-muted">· {c.city}</span> : null}
                </div>
                <p className="text-sm break-words">{c.opportunity}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                      <Globe className="h-3.5 w-3.5" aria-hidden /> {displayHost(c.website)}
                    </a>
                  ) : (
                    <span className="text-muted">Sem site próprio</span>
                  )}
                  {c.social_url ? (
                    <a href={c.social_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {displayHost(c.social_url)}
                    </a>
                  ) : null}
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {c.phone}
                    </span>
                  ) : null}
                  {c.email ? (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Mail className="h-3.5 w-3.5" aria-hidden /> {c.email}
                    </span>
                  ) : null}
                </div>
                {c.services.length ? <ServiceChips services={c.services} /> : null}
                {c.source_url ? (
                  <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="w-fit text-xs text-muted hover:underline">
                    Fonte: {displayHost(c.source_url)}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <label className="mr-auto inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={audit} onChange={(e) => setAudit(e.target.checked)} />
          Analisar os sites depois de adicionar
        </label>
        <Button onClick={onAdd} loading={add.isPending} disabled={!chosen.length}>
          {chosen.length === 1 ? 'Adicionar 1 lead' : `Adicionar ${chosen.length} leads`}
        </Button>
      </div>
    </>
  );
}

function RunCard({ id }: { id: string }) {
  const { data: run, isLoading } = useLeadGenerationRun(id);
  const qc = useQueryClient();
  const status = run?.status;
  // Quando termina, a lista de pesquisas (e o botão "Procurar") atualiza-se.
  useEffect(() => {
    if (status && status !== 'running') void qc.invalidateQueries({ queryKey: ['lead-generation'], exact: true });
  }, [status, qc]);
  if (isLoading || !run) return <Skeleton className="h-40" />;
  const cost = usd(run.cost_usd);
  return (
    <Card>
      <CardHeader
        title={run.query}
        description={[
          run.city,
          run.status === 'done' ? `${run.candidates.length} empresa(s)` : null,
          run.searches ? `${run.searches} pesquisa(s)` : null,
          cost ? `custo estimado ${cost}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      {run.status === 'running' ? (
        <div role="status" className="flex items-start gap-3 p-4 text-sm">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent-text" aria-hidden />
          <p>
            A pesquisar na internet… pode levar 1 a 3 minutos.
            <span className="block text-muted">Podes sair desta página: o resultado fica guardado em “Pesquisas anteriores”.</span>
          </p>
        </div>
      ) : run.status === 'error' ? (
        <p role="alert" className="m-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {run.error ?? 'A pesquisa falhou.'}
        </p>
      ) : (
        <Results key={run.id} run={run} />
      )}
    </Card>
  );
}

export function LeadGenerator() {
  const { data: runs, isLoading } = useLeadGenerationRuns();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = currentId ?? runs?.[0]?.id ?? null;
  const running = runs?.some((r) => r.status === 'running');

  return (
    <div className="flex flex-col gap-5">
      <SearchForm onStarted={(run) => setCurrentId(run.id)} busy={!!running} />
      {isLoading ? <Skeleton className="h-40" /> : current ? <RunCard id={current} /> : null}
      {runs && runs.length > 1 ? (
        <Card>
          <CardHeader title="Pesquisas anteriores" />
          <ul className="divide-y divide-border" aria-label="Pesquisas anteriores">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setCurrentId(r.id)}
                  aria-current={r.id === current ? 'true' : undefined}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2 aria-[current=true]:bg-surface-2"
                >
                  <History className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  {/* Telemóvel: o resumo passa para baixo do pedido (o pedido não fica cortado cedo). */}
                  <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                    <span className="min-w-0 truncate sm:flex-1">{r.query}</span>
                    <span className="shrink-0 text-xs text-muted tabular sm:text-sm">
                      {r.status === 'running'
                        ? 'a pesquisar…'
                        : r.status === 'error'
                          ? 'falhou'
                          : `${r.candidates.length} empresa(s)`}{' '}
                      · {dateTime(r.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
