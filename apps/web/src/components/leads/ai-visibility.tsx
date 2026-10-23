'use client';

/**
 * GEO — "Aparece nas IAs?" na ficha do lead: faz a uma IA com pesquisa na
 * internet as perguntas de um cliente típico (editáveis) e mostra se o lead
 * aparece, em que posição, e quem aparece no lugar dele.
 */
import { AI_VISIBILITY_LIMITS, defaultVisibilityQuestions, formatDateTime, type AiVisibilityCheck, type Lead } from '@vndesign/core';
import { Bot, CheckCircle2, ChevronDown, Copy, ExternalLink, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CollapseButton, useProspectingCollapsed } from '@/components/ui/collapse';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useAiVisibility, useStartAiVisibility } from '@/lib/queries';
import { cn, displayHost } from '@/lib/utils';

const usd = (v: number | null) => (v === null ? null : v.toLocaleString('pt-PT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }));

export function AiVisibilityCard({ lead }: { lead: Lead }) {
  const { data: checks, isLoading } = useAiVisibility(lead.id, !lead.anonymized_at);
  const start = useStartAiVisibility(lead.id);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useProspectingCollapsed('aparece-nas-ias', lead.status);
  if (lead.anonymized_at) return null;
  const latest = checks?.[0] ?? null;
  const running = latest?.status === 'running';

  async function run(questions: string[]) {
    try {
      await start.mutateAsync(questions.map((q) => q.trim()).filter(Boolean));
      setEditing(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const suggested = () => latest?.questions.length ? latest.questions : defaultVisibilityQuestions({ sector: lead.sector?.name ?? null, city: lead.city });

  return (
    <Card role="region" aria-label="Aparece nas IAs?">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="h-4 w-4 text-accent-text" aria-hidden /> Aparece nas IAs? <span className="text-sm font-normal text-muted">(GEO)</span>
          </span>
        }
        description={
          collapsed && latest?.status === 'done'
            ? `Aparece em ${latest.mentioned_count} de ${latest.results.length} · ${formatDateTime(latest.created_at)}`
            : 'Perguntamos a uma IA com pesquisa na internet o que um cliente perguntaria (sem dizer qual é este lead) e vemos se ele aparece.'
        }
        actions={
          <>
            {!editing && !running ? (
              <Button
                size="sm"
                variant={latest ? 'outline' : 'primary'}
                onClick={() => {
                  setCollapsed(false);
                  setEditing(suggested());
                }}
              >
                {latest ? 'Testar outra vez' : 'Testar'}
              </Button>
            ) : null}
            <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label="Aparece nas IAs?" />
          </>
        }
        className={collapsed ? 'border-b-0' : undefined}
      />
      <div className={cn('flex flex-col gap-4 p-4', collapsed && 'hidden')}>
        {editing ? (
          <QuestionsEditor questions={editing} onChange={setEditing} onCancel={() => setEditing(null)} onRun={() => void run(editing)} busy={start.isPending} />
        ) : isLoading ? (
          <Skeleton className="h-20" />
        ) : !latest ? (
          <p className="text-sm text-muted">
            Mostra ao cliente se o ChatGPT ou o Claude o recomendam quando alguém procura o que ele vende — e quem aparece no lugar dele.
          </p>
        ) : running ? (
          <p role="status" className="flex items-start gap-2 text-sm">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent-text" aria-hidden />
            <span>
              A perguntar ao {latest.assistant ?? 'assistente'}… pode levar 1 a 3 minutos.
              <span className="block text-muted">Podes sair da ficha: o resultado fica guardado.</span>
            </span>
          </p>
        ) : latest.status === 'error' ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {latest.error ?? 'O teste falhou.'}
          </p>
        ) : (
          <CheckResult check={latest} />
        )}
      </div>
    </Card>
  );
}

function QuestionsEditor({
  questions,
  onChange,
  onCancel,
  onRun,
  busy,
}: {
  questions: string[];
  onChange: (q: string[]) => void;
  onCancel: () => void;
  onRun: () => void;
  busy: boolean;
}) {
  const valid = questions.filter((q) => q.trim().length >= 8).length;
  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Perguntas para a IA"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      <p className="text-sm text-muted">Escreve como um cliente perguntaria (o setor e a zona contam). Podes mudar as sugestões.</p>
      <ol className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-right text-sm text-muted tabular">{i + 1}.</span>
            <Input
              value={q}
              maxLength={200}
              aria-label={`Pergunta ${i + 1}`}
              onChange={(e) => onChange(questions.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {questions.length > 1 ? (
              <Button type="button" size="sm" variant="ghost" aria-label={`Tirar a pergunta ${i + 1}`} onClick={() => onChange(questions.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {questions.length < AI_VISIBILITY_LIMITS.questions ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...questions, ''])}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Mais uma pergunta
          </Button>
        ) : null}
        <span className="mr-auto text-xs text-muted">Usa a pesquisa da IA: cerca de 5 a 20 cêntimos por teste.</span>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={busy} disabled={!valid}>
          <Bot className="h-4 w-4" aria-hidden /> Perguntar à IA
        </Button>
      </div>
    </form>
  );
}

function CheckResult({ check }: { check: AiVisibilityCheck }) {
  const [open, setOpen] = useState<number | null>(null);
  const total = check.results.length;
  const tone = check.mentioned_count === 0 ? 'danger' : check.mentioned_count === total ? 'success' : 'warning';

  async function copySummary() {
    if (!check.summary) return;
    try {
      await navigator.clipboard.writeText(check.summary);
      toast.success('Frase copiada.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>
          Aparece em {check.mentioned_count} de {total}
        </Badge>
        <span className="text-xs text-muted">
          {formatDateTime(check.created_at)} · {check.assistant}
          {check.model ? ` · ${check.model}` : ''}
          {usd(check.cost_usd) ? ` · custo estimado ${usd(check.cost_usd)}` : ''}
        </span>
      </div>

      {check.summary ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <p className="flex-1">{check.summary}</p>
          <Button size="sm" variant="ghost" onClick={() => void copySummary()} aria-label="Copiar a frase para o cliente">
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label="Respostas da IA">
        {check.results.map((r, i) => (
          <li key={i} className="text-sm">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-2"
            >
              {r.mentioned ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Aparece" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Não aparece" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.question}</span>
                <span className="block text-xs text-muted">
                  {r.mentioned ? (r.position ? `Aparece em ${r.position}.º lugar` : 'Aparece no texto da resposta') : 'Não aparece'}
                  {r.companies.length ? ` · ${r.companies.length} empresa${r.companies.length === 1 ? '' : 's'} recomendada${r.companies.length === 1 ? '' : 's'}` : ' · sem recomendações'}
                </span>
              </span>
              <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} aria-hidden />
            </button>
            {open === i ? (
              <div className="flex flex-col gap-2 px-3 pb-3 pl-9">
                {r.answer ? <p className="text-muted">“{r.answer}”</p> : null}
                {r.companies.length ? (
                  <ol className="flex flex-col gap-1">
                    {r.companies.map((c, j) => (
                      <li key={j} className={cn('flex flex-wrap items-center gap-x-1.5', r.position === j + 1 && 'font-semibold text-success')}>
                        <span className="w-5 text-right text-xs text-muted tabular">{j + 1}.</span>
                        {c.name}
                        {c.website ? (
                          <a href={c.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-xs text-accent-text hover:underline">
                            {displayHost(c.website)}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {check.competitors.length ? (
        <section aria-label="Quem aparece no lugar dele">
          <h4 className="mb-1.5 text-sm font-semibold">Quem aparece no lugar dele</h4>
          <ul className="flex flex-wrap gap-2">
            {check.competitors.map((c) => (
              <li key={`${c.name}-${c.website ?? ''}`} className="rounded-lg border border-border px-2.5 py-1 text-sm">
                {c.website ? (
                  <a href={c.website} target="_blank" rel="noreferrer noopener" className="hover:underline">
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
                <span className="ml-1.5 text-xs text-muted">
                  {c.count}× de {total}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-muted">
        As respostas das IAs mudam de pessoa para pessoa e de dia para dia: isto é uma amostra de hoje, não uma posição fixa.
      </p>
    </>
  );
}
