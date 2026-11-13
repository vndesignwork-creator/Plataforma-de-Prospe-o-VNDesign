'use client';

/**
 * Definições → Repor a partir de uma cópia: carrega o Excel da cópia de segurança semanal, vê o
 * que falta agora (leads que já não existem e tarefas em falta) e repõe só isso.
 */
import type { BackupRestorePreview, BackupRestoreResult } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { errorMessage } from '@/lib/api-client';

async function send<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1${path}`, { method: 'POST', body: form, credentials: 'same-origin' });
  const body = (await res.json().catch(() => null)) as { data?: T; title?: string; detail?: string } | null;
  if (!res.ok) throw Object.assign(new Error(body?.detail ?? body?.title ?? 'Não foi possível ler a cópia.'), { status: res.status });
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<BackupRestoreResult | null>(null);

  async function choose(f: File | null) {
    setFile(f);
    setPreview(null);
    setDone(null);
    if (!f) return;
    setBusy(true);
    try {
      setPreview(await send<BackupRestorePreview>('/backup/restore/preview', f));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!file) return;
    setBusy(true);
    try {
      const result = await send<BackupRestoreResult>('/backup/restore', file);
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
        description="Carrega o Excel da cópia de segurança semanal (vem por email). Mostramos o que falta agora e repomos só isso: nada do que existe é alterado ou apagado."
      />
      <div className="flex flex-col gap-3 px-4 pb-4 text-sm">
        <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="Ficheiro da cópia de segurança" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
        <Button variant="outline" className="self-start" onClick={() => input.current?.click()} loading={busy && !preview}>
          <FileUp className="h-4 w-4" aria-hidden /> {file ? 'Escolher outra cópia' : 'Escolher a cópia (.xlsx)'}
        </Button>
        {file ? <p className="text-xs text-muted">{file.name}</p> : null}

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
