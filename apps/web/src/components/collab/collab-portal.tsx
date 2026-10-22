'use client';

/**
 * Portal do colaborador: os projetos para que foi convidado e, em cada um, as
 * tarefas, as entregas, o briefing e as próprias horas (sem dados do cliente
 * nem valores).
 */
import {
  DELIVERABLE_STATUS_LABELS,
  PROJECT_STAGE_LABELS,
  formatDate,
  formatDateTime,
  formatMinutes,
  todayIso,
  type CollabProject,
  type CollabProjectSummary,
} from '@vndesign/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Clock, ExternalLink, FolderOpen, ListChecks, Pause, Play, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DueBadge, ProgressBar, StageSteps } from '@/components/projects/project-bits';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export function CollabHome() {
  const { data, isLoading } = useQuery({
    queryKey: ['collab', 'projects'],
    queryFn: () => api<{ data: CollabProjectSummary[] }>('/collab/projects').then((r) => r.data),
  });
  const [today] = useState(() => todayIso());
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Os meus projetos</h1>
        <p className="mt-1 text-sm text-muted">Os projetos para que foste convidado: tarefas, ficheiros, briefing e as tuas horas.</p>
      </div>
      {isLoading ? <Skeleton className="h-32" /> : null}
      {data && !data.length ? (
        <Card>
          <EmptyState title="Ainda não tens projetos">
            Quando aceitares um convite, o projeto aparece aqui. Se o acesso foi removido, fala com quem te convidou.
          </EmptyState>
        </Card>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Projetos">
        {(data ?? []).map((p) => (
          <li key={p.lead_id}>
            <Link href={`/colaborador/${p.lead_id}`} className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 hover:border-border-strong">
              <span className="font-display text-lg font-semibold">{p.company_name}</span>
              <span className="text-xs text-muted">Convite de {p.owner}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs">{PROJECT_STAGE_LABELS[p.stage]}</span>
                {p.due_on ? <DueBadge dueOn={p.due_on} today={today} /> : null}
              </span>
              {p.tasks.total ? <ProgressBar value={p.tasks.done} total={p.tasks.total} label={`${p.tasks.done} de ${p.tasks.total} tarefas`} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useCollabProject(leadId: string) {
  return useQuery({
    queryKey: ['collab', 'project', leadId],
    queryFn: () => api<{ data: CollabProject }>(`/collab/projects/${leadId}`).then((r) => r.data),
  });
}

function useCollabAction(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'PATCH'; body: unknown }) =>
      api(`/collab/projects/${leadId}${path}`, { method, body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collab'] });
    },
  });
}

export function CollabProjectView({ leadId }: { leadId: string }) {
  const { data, isLoading, error } = useCollabProject(leadId);
  const [today] = useState(() => todayIso());
  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) {
    return (
      <Card>
        <EmptyState title="Projeto não encontrado">{errorMessage(error)}</EmptyState>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/colaborador" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Os meus projetos
        </Link>
        <h1 className="font-display text-2xl font-bold">{data.company_name}</h1>
        <p className="text-sm text-muted">
          Projeto de {data.owner.name}
          {data.owner.email ? (
            <>
              {' · '}
              <a href={`mailto:${data.owner.email}`} className="text-accent-text hover:underline">
                {data.owner.email}
              </a>
            </>
          ) : null}
          {data.website ? (
            <>
              {' · '}
              <a href={data.website} target="_blank" rel="noreferrer noopener" className="text-accent-text hover:underline">
                site atual
              </a>
            </>
          ) : null}
        </p>
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Fase: {PROJECT_STAGE_LABELS[data.stage]}</span>
          {data.due_on ? (
            <>
              <span className="text-muted">· entrega a {formatDate(data.due_on)}</span>
              <DueBadge dueOn={data.due_on} today={today} />
            </>
          ) : null}
        </p>
        <StageSteps stage={data.stage} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <TasksBox project={data} />
        <TimeBox project={data} />
        <DeliverablesBox project={data} />
        {data.briefing ? <BriefingBox project={data} /> : null}
      </div>
    </div>
  );
}

function TasksBox({ project }: { project: CollabProject }) {
  const action = useCollabAction(project.lead_id);
  const [title, setTitle] = useState('');
  const done = project.tasks.filter((t) => t.done).length;

  async function run(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST') {
    try {
      await action.mutateAsync({ path, body, method });
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }

  return (
    <Card>
      <CardHeader title="Tarefas" description={project.tasks.length ? `${done} de ${project.tasks.length} feitas` : undefined} />
      <ul className="flex flex-col p-2" aria-label="Tarefas do projeto">
        {project.tasks.map((t) => (
          <li key={t.id}>
            <label className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                checked={t.done}
                disabled={action.isPending}
                onChange={(e) => void run(`/tasks/${t.id}`, { done: e.target.checked }, 'PATCH')}
              />
              <span className={cn('flex-1', t.done && 'text-muted line-through')}>{t.title}</span>
              {t.due_on ? <span className="text-xs text-muted tabular">{formatDate(t.due_on)}</span> : null}
            </label>
          </li>
        ))}
        {!project.tasks.length ? <li className="px-2 py-1.5 text-sm text-muted">Ainda não há tarefas.</li> : null}
      </ul>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (title.trim() && (await run('/tasks', { title: title.trim() }))) setTitle('');
        }}
      >
        <label htmlFor="collab-task" className="sr-only">
          Nova tarefa
        </label>
        <Input id="collab-task" placeholder="Nova tarefa" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={!title.trim() || action.isPending}>
          <Plus className="h-4 w-4" aria-hidden /> Juntar
        </Button>
      </form>
    </Card>
  );
}

function Elapsed({ since, base }: { since: string; base: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = base + Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return <span className="tabular">{`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}</span>;
}

function TimeBox({ project }: { project: CollabProject }) {
  const action = useCollabAction(project.lead_id);
  const [manual, setManual] = useState({ date: todayIso(), minutes: '', notes: '' });
  const running = project.time.running;
  const loggedSeconds = project.time.entries.filter((e) => e.ended_at).reduce((s, e) => s + e.seconds, 0);

  async function timer(a: 'start' | 'stop') {
    try {
      await action.mutateAsync({ path: '/time', body: { action: a } });
      toast.success(a === 'start' ? 'Temporizador a contar.' : 'Tempo registado.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(manual.minutes);
    if (!Number.isInteger(minutes) || minutes < 1) return toast.error('Indica os minutos.');
    try {
      await action.mutateAsync({ path: '/time/manual', body: { date: manual.date, minutes, notes: manual.notes || undefined } });
      setManual({ date: todayIso(), minutes: '', notes: '' });
      toast.success('Horas registadas.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="As minhas horas" description={`Total: ${formatMinutes(project.time.total_minutes)}`} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-muted" aria-hidden />
          <span className="text-2xl font-semibold">
            {running ? <Elapsed since={running.started_at} base={loggedSeconds} /> : formatMinutes(project.time.total_minutes)}
          </span>
          {running ? (
            <Button className="ml-auto" variant="outline" onClick={() => timer('stop')} loading={action.isPending}>
              <Pause className="h-4 w-4" aria-hidden /> Pausar
            </Button>
          ) : (
            <Button className="ml-auto" onClick={() => timer('start')} loading={action.isPending}>
              <Play className="h-4 w-4" aria-hidden /> {project.time.entries.length ? 'Continuar' : 'Começar'}
            </Button>
          )}
        </div>
        <form onSubmit={addManual} className="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[10rem_6rem_1fr_auto]" aria-label="Registar horas à mão">
          <DateInput value={manual.date} onChange={(v) => setManual({ ...manual, date: v })} aria-label="Dia" />
          <Input inputMode="numeric" placeholder="Minutos" aria-label="Minutos" value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: e.target.value })} />
          <Input placeholder="O que fizeste (opcional)" aria-label="Notas" maxLength={300} value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} className="col-span-2 sm:col-span-1" />
          <Button type="submit" size="sm" variant="outline" className="col-span-2 sm:col-span-1" disabled={action.isPending}>
            À mão
          </Button>
        </form>
        {project.time.entries.length ? (
          <ul className="divide-y divide-border text-sm" aria-label="Os meus registos">
            {project.time.entries.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted">{formatDateTime(e.started_at)}{e.notes ? ` · ${e.notes}` : ''}</span>
                <span className="tabular">{e.ended_at ? formatMinutes(e.minutes) : 'a contar…'}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

function DeliverablesBox({ project }: { project: CollabProject }) {
  const action = useCollabAction(project.lead_id);
  const [form, setForm] = useState({ title: '', url: '' });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await action.mutateAsync({ path: '/deliverables', body: { title: form.title.trim(), url: form.url.trim() || undefined } });
      setForm({ title: '', url: '' });
      toast.success('Entrega junta. Quem te convidou é avisado.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Ficheiros e entregas" description="Links do Drive, Figma, Canva… (quem te convidou envia ao cliente)" />
      <ul className="flex flex-col gap-1 p-3 text-sm" aria-label="Entregas">
        {project.deliverables.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-2">
            <FolderOpen className="h-4 w-4 text-muted" aria-hidden />
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                {d.title} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              <span className="font-medium">{d.title}</span>
            )}
            <span className="text-xs text-muted">{DELIVERABLE_STATUS_LABELS[d.status]}</span>
          </li>
        ))}
        {!project.deliverables.length ? <li className="text-muted">Ainda não há entregas.</li> : null}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row">
        <Input placeholder="Título (ex.: Maquete da página inicial)" aria-label="Título" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input type="url" inputMode="url" placeholder="https://…" aria-label="Link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <Button type="submit" size="sm" variant="outline" disabled={!form.title.trim() || action.isPending}>
          <Plus className="h-4 w-4" aria-hidden /> Juntar
        </Button>
      </form>
    </Card>
  );
}

function BriefingBox({ project }: { project: CollabProject }) {
  const b = project.briefing!;
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Briefing do cliente" description={b.status === 'respondido' ? 'Respostas do cliente' : 'O cliente ainda não respondeu (ou está a completar).'} />
      <div className="flex flex-col gap-3 p-4 text-sm">
        {b.items.map((q, i) => (
          <div key={i}>
            <p className="font-medium">
              <ClipboardList className="mr-1.5 inline h-4 w-4 text-muted" aria-hidden />
              {q.question}
            </p>
            <p className="mt-0.5 whitespace-pre-line text-muted">{q.answer}</p>
          </div>
        ))}
        {b.files.length ? (
          <div>
            <p className="mb-1 font-medium">
              <ListChecks className="mr-1.5 inline h-4 w-4 text-muted" aria-hidden />
              Ficheiros
            </p>
            <ul className="flex flex-col gap-1">
              {b.files.map((f) => (
                <li key={f.url}>
                  <a href={f.url} className="text-accent-text hover:underline">
                    {f.name}
                  </a>{' '}
                  <span className="text-xs text-muted">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!b.items.length && !b.files.length ? <p className="text-muted">Ainda sem respostas.</p> : null}
      </div>
    </Card>
  );
}
