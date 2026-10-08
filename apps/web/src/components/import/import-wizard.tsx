'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  DUPLICATE_REASON_LABELS,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  formatDateTime,
  type ImportAction,
  type ImportAnalysis,
  type ImportJob,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportTarget,
} from '@vndesign/core';
import { AlertTriangle, Ban, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useImports, useInvalidateLead } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Step = 'file' | 'mapping' | 'review' | 'done';

/** Valor de ação no select: "create", "skip" ou "merge:<lead_id>". */
type Choice = string;

const STEPS: { id: Step; label: string }[] = [
  { id: 'file', label: 'Ficheiro' },
  { id: 'mapping', label: 'Colunas' },
  { id: 'review', label: 'Revisão' },
  { id: 'done', label: 'Resultado' },
];

function Stepper({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2 text-sm" aria-label="Passos da importação">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2" aria-current={i === current ? 'step' : undefined}>
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
              i < current && 'bg-surface-3 text-fg',
              i === current && 'bg-accent text-accent-fg',
              i > current && 'border border-border text-muted',
            )}
          >
            {i + 1}
          </span>
          <span className={i === current ? 'font-semibold' : 'text-muted'}>{s.label}</span>
          {i < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function defaultChoice(row: ImportPreviewRow): Choice {
  return row.suggested_action === 'create' ? 'create' : 'skip';
}

function ImportHistory() {
  const { data } = useImports();
  if (!data?.length) return null;
  return (
    <Card className="mt-5">
      <CardHeader title="Importações anteriores" />
      <ul className="divide-y divide-border">
        {data.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted" aria-hidden />
              {job.filename ?? (job.source === 'api' ? 'API de integração' : 'Ficheiro')}
              <span className="text-muted">· {formatDateTime(job.created_at)}</span>
            </span>
            <span className="text-muted">
              {job.stats.created} criados · {job.stats.merged} juntados · {job.stats.skipped} ignorados
              {job.stats.blocked ? ` · ${job.stats.blocked} bloqueados` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ImportWizard() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLead();
  const inputId = useId();
  const [step, setStep] = useState<Step>('file');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<ImportTarget[]>([]);
  const [keepNumbers, setKeepNumbers] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [result, setResult] = useState<ImportJob | null>(null);
  const [dragging, setDragging] = useState(false);

  async function analyze(f: File, sheet?: string) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', f);
      if (sheet) form.append('sheet', sheet);
      const res = await fetch('/api/v1/imports/analyze', { method: 'POST', body: form, credentials: 'same-origin' });
      const payload = await res.json();
      if (!res.ok) throw new ApiClientError(res.status, payload);
      const a = payload.data as ImportAnalysis;
      if (!a.rows.length) throw new Error('O ficheiro não tem linhas de dados.');
      setFile(f);
      setAnalysis(a);
      setMapping(a.suggested_mapping);
      setStep('mapping');
    } catch (e) {
      setError(e instanceof Error && !(e instanceof ApiClientError) ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!analysis) return;
    if (!mapping.includes('company_name')) {
      setError('Indica qual a coluna com o nome da empresa.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<{ data: ImportPreview }>('/imports/preview', {
        method: 'POST',
        body: { rows: analysis.rows, mapping },
      });
      setPreview(data);
      setChoices(Object.fromEntries(data.rows.map((r) => [r.index, defaultChoice(r)])));
      setStep('review');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || !analysis) return;
    setBusy(true);
    setError(null);
    const items = preview.rows
      .filter((r) => r.status === 'ok' && !r.blocked)
      .map((r) => {
        const choice = choices[r.index] ?? 'skip';
        const [action, target] = choice.split(':') as [ImportAction, string | undefined];
        return { index: r.index, action, target_id: target ?? null, number: r.number, lead: r.lead };
      });
    try {
      const { data } = await api<{ data: ImportJob }>('/imports', {
        method: 'POST',
        body: { filename: file?.name, source: analysis.source, keep_numbers: keepNumbers, items },
      });
      setResult(data);
      setStep('done');
      invalidate();
      void qc.invalidateQueries({ queryKey: ['imports'] });
      toast.success(`${data.stats.created} leads criados, ${data.stats.merged} juntados.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('file');
    setFile(null);
    setAnalysis(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  const errorBox = error ? (
    <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null;

  // ---------------------------------------------------------------------------
  if (step === 'file') {
    return (
      <>
        <Stepper step={step} />
        {errorBox}
        <Card>
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void analyze(f);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong',
            )}
          >
            <Upload className="h-8 w-8 text-accent-text" aria-hidden />
            <span className="font-display text-lg font-semibold">
              {busy ? 'A ler o ficheiro…' : 'Escolhe ou arrasta um ficheiro CSV ou Excel (.xlsx)'}
            </span>
            <span className="max-w-md text-sm text-muted">
              Para importar a tua folha do Google Sheets: <strong>Ficheiro → Transferir → Microsoft Excel (.xlsx)</strong>.
              Deteto automaticamente o separador “🎯 Pipeline de Leads”, o cabeçalho e os valores com emoji.
            </span>
            <input
              id={inputId}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analyze(f);
                e.target.value = '';
              }}
            />
          </label>
        </Card>
        <ImportHistory />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  if (step === 'mapping' && analysis) {
    const used = new Map<ImportTarget, number>();
    mapping.forEach((m) => used.set(m, (used.get(m) ?? 0) + 1));
    const samples = (col: number) =>
      analysis.rows
        .map((r) => r[col] ?? '')
        .filter((v) => v.trim() && v.trim() !== '--')
        .slice(0, 2)
        .map((v) => (v.length > 60 ? `${v.slice(0, 60)}…` : v).replace(/\s+/g, ' '));
    return (
      <>
        <Stepper step={step} />
        {errorBox}
        <Card>
          <CardHeader
            title={`${file?.name ?? 'Ficheiro'} · ${analysis.rows.length} linha${analysis.rows.length === 1 ? '' : 's'}`}
            description={`Cabeçalho detetado na linha ${analysis.header_row + 1}. Confirma a que campo corresponde cada coluna.`}
            actions={
              analysis.sheets.length > 1 ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Folha</span>
                  <Select
                    value={analysis.sheet ?? ''}
                    onChange={(e) => file && void analyze(file, e.target.value)}
                    className="h-9 w-auto"
                    disabled={busy}
                  >
                    {analysis.sheets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2">Coluna no ficheiro</th>
                  <th scope="col" className="px-4 py-2">Exemplos</th>
                  <th scope="col" className="px-4 py-2">Importar como</th>
                </tr>
              </thead>
              <tbody>
                {analysis.headers.map((header, col) => {
                  const target = mapping[col] ?? 'ignore';
                  const duplicated = target !== 'ignore' && (used.get(target) ?? 0) > 1;
                  return (
                    <tr key={col} className="border-t border-border align-top">
                      <th scope="row" className="px-4 py-2 text-left font-medium">
                        {header}
                      </th>
                      <td className="max-w-80 px-4 py-2 text-muted">
                        {samples(col).map((s, i) => (
                          <span key={i} className="block truncate">
                            {s}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          aria-label={`Campo para a coluna ${header}`}
                          value={target}
                          aria-invalid={duplicated || undefined}
                          onChange={(e) =>
                            setMapping((m) => m.map((v, i) => (i === col ? (e.target.value as ImportTarget) : v)))
                          }
                          className="h-9 min-w-52"
                        >
                          <option value="ignore">— Ignorar —</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {IMPORT_FIELD_LABELS[f]}
                            </option>
                          ))}
                        </Select>
                        {duplicated ? <p className="mt-1 text-xs text-danger">Campo usado em mais de uma coluna.</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepNumbers}
                onChange={(e) => setKeepNumbers(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Manter a numeração (#) da folha, quando estiver livre
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>
                Outro ficheiro
              </Button>
              <Button onClick={runPreview} loading={busy}>
                Pré-visualizar
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  if (step === 'review' && preview && analysis) {
    const rows = preview.rows.filter((r) => r.status !== 'empty');
    const counts = { create: 0, merge: 0, skip: 0 };
    for (const r of rows) {
      if (r.status !== 'ok' || r.blocked) continue;
      const c = choices[r.index] ?? 'skip';
      counts[c.startsWith('merge') ? 'merge' : (c as 'create' | 'skip')]++;
    }
    const strongDup = (r: ImportPreviewRow) => r.duplicates.find((d) => d.strength === 'strong');
    const setAllDuplicates = (mode: 'merge' | 'skip') =>
      setChoices((c) => {
        const next = { ...c };
        for (const r of rows) {
          const d = strongDup(r);
          if (r.status === 'ok' && !r.blocked && d) next[r.index] = mode === 'merge' ? `merge:${d.lead_id}` : 'skip';
        }
        return next;
      });

    return (
      <>
        <Stepper step={step} />
        {errorBox}
        <Card>
          <CardHeader
            title="Revisão"
            description="Escolhe o que fazer com cada linha. “Juntar” só preenche os campos vazios do lead existente."
            actions={
              preview.summary.duplicates ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setAllDuplicates('merge')}>
                    Juntar todos os duplicados
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAllDuplicates('skip')}>
                    Ignorar duplicados
                  </Button>
                </>
              ) : null
            }
          />
          <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3 text-sm" role="status" aria-live="polite">
            <Badge tone="success">{counts.create} a criar</Badge>
            <Badge tone="accent">{counts.merge} a juntar</Badge>
            <Badge>{counts.skip} a ignorar</Badge>
            {preview.summary.duplicates ? <Badge tone="warning">{preview.summary.duplicates} duplicados</Badge> : null}
            {preview.summary.blocked ? <Badge tone="danger">{preview.summary.blocked} na lista “não contactar”</Badge> : null}
            {preview.summary.invalid ? <Badge tone="danger">{preview.summary.invalid} inválidas</Badge> : null}
          </div>
          <div className="max-h-[60dvh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">Linha</th>
                  <th scope="col" className="px-3 py-2">Empresa</th>
                  <th scope="col" className="px-3 py-2">Verificação</th>
                  <th scope="col" className="px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const line = analysis.header_row + 2 + r.index;
                  const name = (r.lead?.company_name as string | undefined) ?? analysis.rows[r.index]?.find((v) => v.trim()) ?? '—';
                  const strong = r.duplicates.filter((d) => d.strength === 'strong');
                  return (
                    <tr key={r.index} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-muted tabular">{line}</td>
                      <td className="max-w-64 px-3 py-2">
                        <span className="font-medium">{name}</span>
                        {r.number ? <span className="block text-xs text-muted">#{r.number} na folha</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {r.status === 'invalid' ? (
                            <span className="flex items-center gap-1 text-danger">
                              <Ban className="h-3.5 w-3.5" aria-hidden /> {r.errors.join(' ')}
                            </span>
                          ) : null}
                          {r.blocked ? (
                            <span className="flex items-center gap-1 text-danger">
                              <Ban className="h-3.5 w-3.5" aria-hidden /> Na lista “não contactar”
                            </span>
                          ) : null}
                          {strong.map((d) => (
                            <span key={d.lead_id} className="flex flex-wrap items-center gap-1 text-warning">
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                              Já existe:{' '}
                              <Link href={`/leads/${d.lead_id}`} target="_blank" className="underline">
                                #{d.number} {d.company_name}
                              </Link>
                              <span className="text-muted">({d.reasons.map((x) => DUPLICATE_REASON_LABELS[x] ?? x).join(', ')})</span>
                            </span>
                          ))}
                          {r.in_file_duplicate_of !== null ? (
                            <span className="flex items-center gap-1 text-warning">
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                              Repetido no ficheiro (linha {analysis.header_row + 2 + r.in_file_duplicate_of})
                            </span>
                          ) : null}
                          {r.warnings.length ? (
                            <details className="text-muted">
                              <summary className="cursor-pointer">
                                {r.warnings.length} aviso{r.warnings.length === 1 ? '' : 's'}
                              </summary>
                              <ul className="mt-1 list-disc pl-5 text-xs">
                                {r.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                          {r.status === 'ok' && !r.blocked && !strong.length && r.in_file_duplicate_of === null && !r.warnings.length ? (
                            <span className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> OK
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'ok' && !r.blocked ? (
                          <Select
                            aria-label={`Ação para a linha ${line}`}
                            value={choices[r.index] ?? 'skip'}
                            onChange={(e) => setChoices((c) => ({ ...c, [r.index]: e.target.value }))}
                            className="h-9 min-w-44"
                          >
                            <option value="create">Criar lead</option>
                            {strong.map((d) => (
                              <option key={d.lead_id} value={`merge:${d.lead_id}`}>
                                Juntar com #{d.number}
                              </option>
                            ))}
                            <option value="skip">Ignorar</option>
                          </Select>
                        ) : (
                          <span className="text-muted">Não importada</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" onClick={() => setStep('mapping')}>
              Voltar às colunas
            </Button>
            <Button onClick={commit} loading={busy} disabled={counts.create + counts.merge === 0}>
              Importar {counts.create + counts.merge} lead{counts.create + counts.merge === 1 ? '' : 's'}
            </Button>
          </div>
        </Card>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  if (step === 'done' && result) {
    const created = result.report.filter((r) => r.result === 'created');
    return (
      <>
        <Stepper step={step} />
        <Card>
          <CardHeader title="Importação concluída" description={file?.name} />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {[
              ['Criados', result.stats.created],
              ['Juntados', result.stats.merged],
              ['Ignorados', result.stats.skipped],
              ['Bloqueados', result.stats.blocked],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border px-3 py-2">
                <p className="text-sm text-muted">{label}</p>
                <p className="text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {created.length ? (
            <ul className="mx-4 mb-4 max-h-64 overflow-auto rounded-lg border border-border text-sm">
              {created.map((r) => (
                <li key={r.index} className="border-b border-border px-3 py-1.5 last:border-0">
                  <Link href={`/leads/${r.lead_id}`} className="hover:underline">
                    <span className="text-muted tabular">#{r.number}</span> {r.company_name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" onClick={reset}>
              Importar outro ficheiro
            </Button>
            <Link href="/leads" className={buttonClasses('primary')}>
              Ver leads
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return null;
}
