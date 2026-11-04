'use client';

/**
 * Gerador de leads: descreve que empresas procuras → a IA pesquisa na
 * internet (1–3 minutos, em segundo plano) → revês a lista e escolhes quais
 * entram como leads (os sites são analisados a seguir).
 */
import { cleanAiText, type LeadCandidate, type LeadGenerationRun } from '@vndesign/core';
import { CalendarClock, ChevronDown, ExternalLink, Globe, History, Loader2, Mail, Phone, Repeat, RotateCcw, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { ServiceChips } from '@/components/services/services';
import { errorMessage } from '@/lib/api-client';
import {
  useAddGeneratedLeads,
  useLeadGenerationRun,
  useLeadGenerationRuns,
  useLeadGenerationSchedules,
  useRole,
  useStartLeadGeneration,
  useTeamStats,
} from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';
import { ScheduleDialog, SchedulesCard } from './schedules';
import { COUNTS, EMPTY_DRAFT, SEARCH_EXAMPLES, SearchFields, draftToRequest, type SearchDraft } from './search-fields';

const usd = (value: number | null) => (value === null ? null : value.toLocaleString('pt-PT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }));

const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function SearchForm({
  draft,
  setDraft,
  ideas,
  onStarted,
  busy,
  prospector,
}: {
  draft: SearchDraft;
  setDraft: (draft: SearchDraft) => void;
  ideas: string[];
  onStarted: (run: LeadGenerationRun) => void;
  busy: boolean;
  prospector: boolean;
}) {
  const start = useStartLeadGeneration();
  const [error, setError] = useState<string | undefined>();
  const [scheduling, setScheduling] = useState(false);

  function valid() {
    if (draft.query.trim().length < 3) {
      setError('Descreve que empresas procuras.');
      return false;
    }
    setError(undefined);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid()) return;
    try {
      onStarted(await start.mutateAsync(draftToRequest(draft)));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card id="nova-pesquisa" className="scroll-mt-20">
      <CardHeader
        title="Nova pesquisa"
        description="A IA pesquisa na internet empresas reais que encaixam no pedido. Revês a lista antes de entrar algum lead."
      />
      {/* Pedido em cima; Zona, Setor, Serviços e Quantas numa linha (2×2 no telemóvel). */}
      <form onSubmit={submit} className="grid grid-cols-2 gap-4 p-4 lg:grid-cols-4" noValidate>
        <SearchFields value={draft} onChange={setDraft} error={error} ideas={ideas} />
        <div className="col-span-full flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {/* As pesquisas automáticas são do dono (o prospetor tem um limite semanal). */}
          {prospector ? null : (
            <Button type="button" variant="ghost" onClick={() => valid() && setScheduling(true)} className="mr-auto">
              <Repeat className="h-4 w-4" aria-hidden />
              Repetir todas as semanas
            </Button>
          )}
          <span className="text-xs text-muted" title="Usa créditos do fornecedor de IA; o custo real aparece no fim.">
            ≈ 0,20–1,50 $ por pesquisa
          </span>
          <Button type="submit" loading={start.isPending} disabled={busy}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Procurar com IA
          </Button>
        </div>
      </form>
      {scheduling ? <ScheduleDialog open onOpenChange={setScheduling} initial={draft} /> : null}
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
                <p className="text-sm break-words">{cleanAiText(c.opportunity)}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {c.website ? (
                    <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                      <Globe className="h-3.5 w-3.5" aria-hidden /> {displayHost(c.website)}
                    </a>
                  ) : (
                    <span className="text-muted">Sem site próprio</span>
                  )}
                  {c.social_url ? (
                    <a
                      href={c.social_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-text hover:underline"
                    >
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

function RunCard({ id, label, defaultOpen }: { id: string; label: string; defaultOpen: boolean }) {
  const { data: run, isLoading } = useLeadGenerationRun(id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const status = run?.status;
  // Quando termina, a lista de pesquisas (e o botão "Procurar") atualiza-se.
  useEffect(() => {
    if (status && status !== 'running') void qc.invalidateQueries({ queryKey: ['lead-generation'], exact: true });
  }, [status, qc]);
  if (isLoading || !run) return <Skeleton className="h-40" />;
  const cost = usd(run.cost_usd);
  // Enquanto pesquisa, mostra sempre o progresso.
  const expanded = open || run.status === 'running';
  const added = run.candidates.filter((c) => c.added_lead_id).length;
  return (
    <Card>
      <CardHeader
        title={
          <>
            <span className="mb-0.5 block text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
            {run.query}
          </>
        }
        actions={
          <>
            {run.schedule_id ? (
              <Badge tone="accent">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Automática
              </Badge>
            ) : null}
            {run.status !== 'running' ? (
              <Button size="sm" variant="ghost" onClick={() => setOpen(!expanded)} aria-expanded={expanded} aria-controls={`pesquisa-${run.id}`}>
                <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
                {expanded ? 'Esconder' : run.status === 'error' ? 'Ver o erro' : 'Ver empresas'}
              </Button>
            ) : null}
          </>
        }
        className={cn(!expanded && 'border-b-0')}
        description={[
          run.city,
          added && !run.auto_added ? `${added} adicionada(s)` : null,
          run.auto_added ? `${run.auto_added} adicionado(s) automaticamente` : null,
          run.status === 'done' ? `${run.candidates.length} empresa(s)` : null,
          run.searches ? `${run.searches} pesquisa(s)` : null,
          cost ? `custo estimado ${cost}` : run.status === 'done' ? 'custo no painel do fornecedor' : null,
          run.model,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <div id={`pesquisa-${run.id}`} hidden={!expanded}>
        {!expanded ? null : run.status === 'running' ? (
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
      </div>
    </Card>
  );
}

/** Prospetor: quantos leads ainda pode juntar pelo gerador esta semana. */
function Allowance() {
  const { data } = useTeamStats();
  const me = data?.members[0];
  if (!me || me.generation_limit === null) return null;
  const room = Math.max(0, me.generation_limit - me.generation_used);
  return (
    <p role="status" className={cn('rounded-lg px-3 py-2 text-sm', room ? 'bg-surface-2' : 'bg-danger-soft text-danger')}>
      {room
        ? `Esta semana podes juntar mais ${room} lead${room === 1 ? '' : 's'} pelo gerador (${me.generation_used} de ${me.generation_limit}).`
        : `Chegaste ao limite desta semana (${me.generation_limit} leads). O limite renova-se ao longo dos próximos dias.`}
    </p>
  );
}

/** As pesquisas recentes mais repetidas primeiro e, a seguir, exemplos (até 6). */
function searchIdeas(runs: LeadGenerationRun[] | undefined): string[] {
  const counts = new Map<string, number>();
  for (const r of runs ?? []) counts.set(r.query, (counts.get(r.query) ?? 0) + 1);
  const recent = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([q]) => q);
  return [...new Set([...recent.slice(0, 3), ...SEARCH_EXAMPLES])].slice(0, 6);
}

const addedCount = (r: LeadGenerationRun) => r.candidates.filter((c) => c.added_lead_id).length;

/** "12 pesquisas recentes · 140 empresas encontradas · 35 viraram leads · 2 automáticas ativas". */
function GeneratorSummary({ runs, prospector }: { runs: LeadGenerationRun[] | undefined; prospector: boolean }) {
  const { data: schedules } = useLeadGenerationSchedules(!prospector);
  if (!runs) return <>Descreve que empresas procuras e a IA pesquisa na internet. Tu escolhes quais entram como leads.</>;
  if (!runs.length) return <>Ainda não fizeste nenhuma pesquisa. Descreve que empresas procuras e a IA pesquisa na internet.</>;
  const found = runs.reduce((n, r) => n + r.candidates.length, 0);
  const added = runs.reduce((n, r) => n + addedCount(r), 0);
  const active = schedules?.filter((s) => s.enabled).length ?? 0;
  const parts = [
    `${runs.length} pesquisa${runs.length === 1 ? '' : 's'} recente${runs.length === 1 ? '' : 's'}`,
    `${found} empresa${found === 1 ? '' : 's'} encontrada${found === 1 ? '' : 's'}`,
    `${added} ${added === 1 ? 'virou lead' : 'viraram leads'}`,
    active ? `${active} automática${active === 1 ? '' : 's'} ativa${active === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return <>{parts.join(' · ')}</>;
}

const PREVIOUS_PAGE = 8;

export function LeadGenerator({ initialRunId }: { initialRunId?: string | null }) {
  const { data: runs, isLoading } = useLeadGenerationRuns();
  // ?pesquisa=… (link da notificação/email da pesquisa automática) abre essa pesquisa.
  const [currentId, setCurrentId] = useState<string | null>(initialRunId ?? null);
  // Cada vez que se abre uma pesquisa (lista, "Correr agora", nova pesquisa), o cartão volta aberto.
  const [openCount, setOpenCount] = useState(0);
  const [draft, setDraft] = useState<SearchDraft>(EMPTY_DRAFT);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const current = currentId ?? runs?.[0]?.id ?? null;
  const currentRun = runs?.find((r) => r.id === current);
  const openRun = (id: string) => {
    setCurrentId(id);
    setOpenCount((n) => n + 1);
  };
  const running = runs?.some((r) => r.status === 'running');
  const prospector = useRole() === 'prospector';

  /** "Repetir": o pedido de uma pesquisa anterior volta ao formulário. */
  function repeat(r: LeadGenerationRun) {
    setDraft({
      query: r.query,
      city: r.city ?? '',
      sectorId: r.sector_id ?? '',
      services: r.services,
      count: COUNTS.includes(r.max_results) ? r.max_results : EMPTY_DRAFT.count,
    });
    const form = document.getElementById('nova-pesquisa');
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form?.querySelector('textarea')?.focus({ preventScroll: true });
    toast.success('Pesquisa copiada para o formulário: revê e carrega em “Procurar com IA”.');
  }

  const q = filter.trim().toLowerCase();
  const previous = (runs ?? []).filter((r) => !q || `${r.query} ${r.city ?? ''}`.toLowerCase().includes(q));
  const shown = showAll || q ? previous : previous.slice(0, PREVIOUS_PAGE);

  return (
    <>
      <PageHeader title="Gerar leads" description={<GeneratorSummary runs={runs} prospector={prospector} />} />
      <div className="flex flex-col gap-5">
        {prospector ? <Allowance /> : null}
        <SearchForm draft={draft} setDraft={setDraft} ideas={searchIdeas(runs)} onStarted={(run) => openRun(run.id)} busy={!!running} prospector={prospector} />
        {/* A pesquisa (a correr ou a última) logo a seguir ao formulário. */}
        <div id="pesquisa-atual" className="scroll-mt-20">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : current ? (
            <RunCard
              key={`${current}-${openCount}`}
              id={current}
              label={!currentRun || current === runs?.[0]?.id ? 'Última pesquisa' : `Pesquisa de ${dateTime(currentRun.created_at)}`}
              // Ao entrar na página, a última pesquisa aparece fechada; aberta quando se escolhe uma.
              defaultOpen={currentId !== null}
            />
          ) : null}
        </div>
        {prospector ? null : (
          <SchedulesCard
            onOpenRun={(id) => {
              openRun(id);
              // O resultado fica logo acima deste cartão.
              requestAnimationFrame(() => document.getElementById('pesquisa-atual')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            }}
          />
        )}
        {runs && runs.length > 1 ? (
          <Card>
            <CardHeader
              title="Pesquisas anteriores"
              actions={
                runs.length > PREVIOUS_PAGE ? (
                  <div className="relative w-48 max-sm:w-36">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
                    <Input
                      type="search"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Procurar…"
                      aria-label="Procurar nas pesquisas anteriores"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                ) : null
              }
            />
            {shown.length ? (
              <ul className="divide-y divide-border" aria-label="Pesquisas anteriores">
                {shown.map((r) => {
                  const added = addedCount(r);
                  return (
                    <li key={r.id} className={cn('flex items-center gap-1 pr-2', r.id === current && 'bg-surface-2')}>
                      <button
                        type="button"
                        onClick={() => openRun(r.id)}
                        aria-current={r.id === current ? 'true' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2"
                      >
                        {r.schedule_id ? (
                          <CalendarClock className="h-4 w-4 shrink-0 text-accent-text" aria-label="Pesquisa automática" />
                        ) : (
                          <History className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        )}
                        {/* Telemóvel: o resumo passa para baixo do pedido (o pedido não fica cortado cedo). */}
                        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                          <span className="min-w-0 truncate sm:flex-1">
                            {r.query}
                            {r.city ? <span className="text-muted"> · {r.city}</span> : null}
                          </span>
                          <span className="shrink-0 text-xs text-muted tabular sm:text-sm">
                            {r.status === 'running' ? (
                              'a pesquisar…'
                            ) : r.status === 'error' ? (
                              'falhou'
                            ) : (
                              <>
                                {r.candidates.length} empresa(s)
                                {added ? (
                                  <span className="text-success">
                                    {' '}
                                    · {added} lead{added === 1 ? '' : 's'}
                                  </span>
                                ) : null}
                              </>
                            )}{' '}
                            · {dateTime(r.created_at)}
                          </span>
                        </span>
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => repeat(r)}
                        aria-label={`Repetir a pesquisa: ${r.query}`}
                        title="Copiar para o formulário"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        <span className="hidden sm:inline">Repetir</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-4 text-center text-sm text-muted">Nenhuma pesquisa com “{filter.trim()}”.</p>
            )}
            {!q && !showAll && previous.length > PREVIOUS_PAGE ? (
              <div className="border-t border-border p-2 text-center">
                <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                  <ChevronDown className="h-4 w-4" aria-hidden /> Mostrar mais ({previous.length - PREVIOUS_PAGE})
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
