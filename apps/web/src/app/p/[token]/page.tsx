import {
  DELIVERABLE_STATUS_LABELS,
  PROJECT_STAGE_CLIENT_TEXT,
  PROJECT_STAGE_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  type SharedProject,
} from '@vndesign/core';
import { CalendarClock, CheckCircle2, ExternalLink, FolderOpen, Globe, ListChecks, Mail, PackageCheck, Phone, RefreshCcw, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StageSteps } from '@/components/projects/project-bits';
import { getSharedProject } from '@/server/services/project-tools';

/*
 * Página de acompanhamento para o cliente (link /p/<código>, sem login): a
 * fase, as tarefas, a próxima entrega e reunião, as entregas enviadas e o que
 * falta pagar. Só leitura; o link desliga-se ou renova-se na ficha do cliente.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getSharedProject((await params).token);
  return {
    title: { absolute: project ? `Projeto ${project.company_name}` : 'Projeto' },
    robots: { index: false, follow: false },
  };
}

const meetingFmt = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/Lisbon',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

function Box({ icon: Icon, title, children, className }: { icon: typeof ListChecks; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className ?? ''}`} aria-label={title}>
      <h2 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-muted">
        <Icon className="h-4 w-4" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}

function Contacts({ from }: { from: SharedProject['from'] }) {
  const links = [
    from.email ? { href: `mailto:${from.email}`, label: from.email, icon: Mail } : null,
    from.phone ? { href: `tel:${from.phone.replace(/[^\d+]/g, '')}`, label: from.phone, icon: Phone } : null,
    from.website ? { href: from.website, label: from.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), icon: Globe } : null,
  ].filter((l) => l !== null);
  return (
    <footer className="flex flex-col gap-2 border-t border-border pt-5 text-sm text-muted">
      <p>
        Alguma dúvida? Fale com <strong className="text-fg">{from.name}</strong>
        {from.company ? ` (${from.company})` : ''}.
      </p>
      {links.length ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <a href={href} className="inline-flex items-center gap-1.5 text-accent-text hover:underline">
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </footer>
  );
}

export default async function SharedProjectPage({ params }: Props) {
  const project = await getSharedProject((await params).token);
  if (!project) notFound();
  const { tasks, payments, deliverables, revisions, next_meeting: meeting } = project;
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : null;
  const brand = project.from.company ?? project.from.name;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold tracking-tight">
          {brand.startsWith('VN') ? (
            <>
              <span className="text-accent">VN</span>
              {brand.slice(2)}
            </>
          ) : (
            brand
          )}
        </p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Projeto {project.company_name}</h1>
        <p className="text-muted">
          {project.contact_name ? `Olá ${project.contact_name}! ` : 'Olá! '}
          Aqui pode acompanhar o andamento do projeto.
        </p>
        <p className="text-xs text-muted">Atualizado a {formatDateTime(project.updated_at)}</p>
      </header>

      {project.completed_at ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 font-medium text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Projeto concluído a {formatDate(project.completed_at)}. Obrigado pela confiança!
        </p>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-4" aria-label="Fase do projeto">
          <p className="mb-3 text-sm">
            <span className="font-semibold">Fase atual: {PROJECT_STAGE_LABELS[project.stage]}.</span>{' '}
            <span className="text-muted">{PROJECT_STAGE_CLIENT_TEXT[project.stage]}</span>
          </p>
          <StageSteps stage={project.stage} />
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!project.completed_at ? (
          <Box icon={PackageCheck} title="Entrega prevista">
            <p className="text-xl font-semibold">{project.due_on ? formatDate(project.due_on) : 'A combinar'}</p>
          </Box>
        ) : null}
        {meeting ? (
          <Box icon={CalendarClock} title="Próxima reunião">
            <p className="font-semibold first-letter:uppercase">{meetingFmt.format(new Date(meeting.starts_at))}</p>
            {meeting.location ? <p className="mt-0.5 text-sm break-words text-muted">{meeting.location}</p> : null}
          </Box>
        ) : null}
        {pct !== null ? (
          <Box icon={ListChecks} title="Progresso" className="sm:col-span-2">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso das tarefas">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-sm font-semibold tabular">{pct}%</span>
            </div>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {tasks.map((t, i) => (
                <li key={i} className={`flex items-start gap-2 ${t.done ? 'text-muted' : ''}`}>
                  <span aria-hidden className={t.done ? 'text-success' : 'text-muted'}>
                    {t.done ? '✓' : '○'}
                  </span>
                  <span className={t.done ? 'line-through' : ''}>{t.title}</span>
                  <span className="sr-only">{t.done ? '(feito)' : '(por fazer)'}</span>
                </li>
              ))}
            </ul>
          </Box>
        ) : null}
        {deliverables.length ? (
          <Box icon={FolderOpen} title="Entregas" className="sm:col-span-2">
            <ul className="flex flex-col gap-2 text-sm">
              {deliverables.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                      {d.title} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">(abre num novo separador)</span>
                    </a>
                  ) : (
                    <span className="font-medium">{d.title}</span>
                  )}
                  <span className={`text-xs ${d.status === 'aprovada' ? 'text-success' : 'text-muted'}`}>
                    {DELIVERABLE_STATUS_LABELS[d.status]}
                    {d.date ? ` a ${formatDate(d.date)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Box>
        ) : null}
        {payments ? (
          <Box icon={Wallet} title="Pagamentos">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Total</dt>
              <dd className="text-right font-medium tabular">{formatCurrency(payments.total)}</dd>
              <dt className="text-muted">Pago</dt>
              <dd className="text-right font-medium tabular text-success">{formatCurrency(payments.paid)}</dd>
              <dt className="text-muted">Em falta</dt>
              <dd className="text-right font-semibold tabular">{formatCurrency(payments.outstanding)}</dd>
            </dl>
            {payments.next ? (
              <p className="mt-2 text-xs text-muted">
                Próximo: {payments.next.description} — {formatCurrency(payments.next.amount)}
                {payments.next.due_on ? ` (até ${formatDate(payments.next.due_on)})` : ''}
              </p>
            ) : null}
          </Box>
        ) : null}
        {revisions ? (
          <Box icon={RefreshCcw} title="Revisões">
            <p className="text-xl font-semibold tabular">
              {revisions.used} de {revisions.included}
            </p>
            <p className="text-xs text-muted">
              {revisions.used < revisions.included
                ? `Ainda tem ${revisions.included - revisions.used} ronda${revisions.included - revisions.used === 1 ? '' : 's'} de revisão incluída${revisions.included - revisions.used === 1 ? '' : 's'}.`
                : 'As revisões incluídas já foram usadas; outras alterações são orçamentadas à parte.'}
            </p>
          </Box>
        ) : null}
      </div>

      <Contacts from={project.from} />
    </main>
  );
}
