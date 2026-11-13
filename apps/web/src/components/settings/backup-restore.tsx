'use client';

/**
 * Definições → Repor a partir de uma cópia: carrega o Excel da cópia de segurança semanal, vê o
 * que falta agora (leads que já não existem e tarefas em falta) e repõe só isso.
 */
import { formatDateTime, type BackupRestorePreview, type BackupRestoreResult } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Save } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';

type Source = { file: File } | { snapshot: string; label: string };

async function send<T>(path: string, source: Source): Promise<T> {
  let init: RequestInit;
  if ('file' in source) {
    const form = new FormData();
    form.append('file', source.file);
    init = { method: 'POST', body: form, credentials: 'same-origin' };
  } else {
    init = { method: 'POST', body: JSON.stringify({ snapshot: source.snapshot }), headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  }
  const res = await fetch(`/api/v1${path}`, init);
  const body = (await res.json().catch(() => null)) as ({ data?: T; title?: string; detail?: string } & Record<string, unknown>) | null;
  if (!res.ok) throw new ApiClientError(res.status, { title: body?.title ?? 'Não foi possível ler a cópia.', detail: body?.detail, ...(body ?? {}) } as never);
  return body!.data as T;
}

const list = (items: { number: number; company_name: string }[], max = 15) =>
  items
    .slice(0, max)
    .map((l) => `#${l.number} ${l.company_name}`)
    .join(', ') + (items.length > max ? ` e mais ${items.length - max}` : '');

export function BackupRestore() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const snapshots = useQuery({
    queryKey: ['backup-snapshots'],
    queryFn: () => api<{ data: { id: string; created_at: string; size: number | null }[] }>('/backup/snapshots').then((r) => r.data),
  });
  const [saving, setSaving] = useState(false);
  async function saveNow() {
    setSaving(true);
    try {
      const r = await api<{ data: { leads: number; tasks: number } }>('/backup/snapshots', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['backup-snapshots'] });
      toast.success(`Cópia feita: ${r.data.leads} leads e ${r.data.tasks} tarefas.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<BackupRestoreResult | null>(null);

  async function choose(next: Source | null) {
    setSource(next);
    setPreview(null);
    setDone(null);
    if (!next) return;
    setBusy(true);
    try {
      setPreview(await send<BackupRestorePreview>('/backup/restore/preview', next));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!source) return;
    setBusy(true);
    try {
      const result = await send<BackupRestoreResult>('/backup/restore', source);
      setDone(result);
      setPreview(null);
      for (const key of ['leads', 'board', 'dashboard', 'tasks', 'today']) void qc.invalidateQueries({ queryKey: [key] });
      toast.success(`Reposto: ${result.leads_restored} ${result.leads_restored === 1 ? 'lead' : 'leads'} e ${result.tasks_restored} ${result.tasks_restored === 1 ? 'tarefa' : 'tarefas'}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const nothing = preview && !preview.missing_leads.length && !preview.missing_tasks;
  return (
    <Card>
      <CardHeader
        title="Repor a partir de uma cópia"
        description="Escolhe uma das cópias guardadas (as últimas 8) ou carrega o Excel que veio por email. Mostramos o que falta agora e repomos só isso: nada do que existe é alterado ou apagado."
      />
      <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
        <section aria-label="Cópias guardadas" className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Cópias guardadas</h3>
            <Button size="sm" variant="outline" onClick={() => void saveNow()} loading={saving}>
              <Save className="h-3.5 w-3.5" aria-hidden /> Fazer uma cópia agora
            </Button>
          </div>
          {snapshots.data?.length ? (
            <ul className="flex flex-col" aria-label="Cópias guardadas na plataforma">
              {snapshots.data.map((c) => {
                const label = formatDateTime(c.created_at);
                const chosen = source && 'snapshot' in source && source.snapshot === c.id;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
                    <span>
                      {label}
                      {c.size ? <span className="text-xs text-muted"> · {Math.max(1, Math.round(c.size / 1024))} KB</span> : null}
                    </span>
                    <Button size="sm" variant={chosen ? 'primary' : 'ghost'} onClick={() => void choose({ snapshot: c.id, label })} loading={busy && !!chosen && !preview}>
                      Ver o que falta
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted">{snapshots.isLoading ? 'A carregar…' : 'Ainda não há cópias guardadas: a cópia semanal passa a ficar aqui, ou faz uma agora.'}</p>
          )}
        </section>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="sr-only"
          aria-label="Ficheiro da cópia de segurança"
          onChange={(e) => {
            const f = e.target.files?.[0];
            void choose(f ? { file: f } : null);
          }}
        />
        <Button variant="outline" className="self-start" onClick={() => input.current?.click()} loading={busy && !!source && 'file' in source && !preview}>
          <FileUp className="h-4 w-4" aria-hidden /> Carregar o Excel do email (.xlsx)
        </Button>
        {source ? <p className="text-xs text-muted">{'file' in source ? source.file.name : `Cópia de ${source.label}`}</p> : null}

        {preview ? (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-2 px-3 py-2" role="status">
            <p>
              A cópia tem <strong>{preview.leads_in_file}</strong> leads.
            </p>
            {preview.missing_leads.length ? (
              <p>
                <strong>Faltam {preview.missing_leads.length} {preview.missing_leads.length === 1 ? 'lead' : 'leads'}</strong> (repõem-se com o mesmo número):{' '}
                {list(preview.missing_leads)}.
              </p>
            ) : (
              <p>Não falta nenhum lead.</p>
            )}
            {preview.has_tasks ? (
              preview.missing_tasks ? (
                <p>
                  <strong>Faltam {preview.missing_tasks} {preview.missing_tasks === 1 ? 'tarefa' : 'tarefas'}</strong>
                  {preview.missing_tasks_sample.length
                    ? `, por exemplo: ${preview.missing_tasks_sample
                        .slice(0, 5)
                        .map((t) => `“${t.title}” (#${t.number})`)
                        .join(', ')}`
                    : ''}
                  .
                </p>
              ) : (
                <p>Não falta nenhuma tarefa.</p>
              )
            ) : (
              <p className="text-muted">Esta cópia é antiga e não tem as tarefas (só os leads). As cópias novas já as trazem.</p>
            )}
            {preview.in_trash.length ? (
              <p className="text-muted">
                {preview.in_trash.length} {preview.in_trash.length === 1 ? 'está' : 'estão'} na reciclagem ({list(preview.in_trash, 5)}): repõe-nos em{' '}
                <Link href="/definicoes/apagados" className="underline hover:text-fg">
                  Apagados
                </Link>
                , com tudo o que tinham.
              </p>
            ) : null}
            {preview.without_number ? <p className="text-muted">{preview.without_number} linhas sem número não se repõem (não dá para saber se já existem).</p> : null}
            {nothing ? null : (
              <Button className="self-start" onClick={() => void restore()} loading={busy}>
                Repor o que falta
              </Button>
            )}
          </div>
        ) : null}
        {done ? (
          <p role="status" className="text-success">
            Pronto: {done.leads_restored} {done.leads_restored === 1 ? 'lead reposto' : 'leads repostos'} e {done.tasks_restored}{' '}
            {done.tasks_restored === 1 ? 'tarefa reposta' : 'tarefas repostas'}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
