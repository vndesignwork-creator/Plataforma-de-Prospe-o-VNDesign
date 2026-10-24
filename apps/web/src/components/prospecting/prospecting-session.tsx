'use client';

/**
 * Sessão de prospeção: a lista de chamadas do dia. Cada linha tem os botões
 * para contactar (ligar, WhatsApp, email) e para registar o resultado com um
 * toque. O lead não salta: passa para "Feito nesta sessão", onde se vê a
 * contagem subir e se pode registar outra tentativa. Os leads sem telefone nem
 * email ficam no separador "Falta contacto" (com o "Procurar contacto").
 */
import {
  NO_ANSWER_LIMIT,
  PROSPECTING_FILTER_LABELS,
  PROSPECTING_FILTERS,
  formatDate,
  leadPath,
  type Lead,
  type LostReason,
  type ProspectingAttempts,
  type ProspectingFilter,
  type ProspectingItem,
  type ProspectingOutcome,
  type ProspectingResult,
} from '@vndesign/core';
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Eye,
  Flame,
  MessageCircle,
  NotebookPen,
  Phone,
  PhoneOff,
  Pin,
  RotateCcw,
  Route,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SendEmailButton } from '@/components/email/send-email-dialog';
import { StatusBadge } from '@/components/leads/badges';
import { ContactFinder } from '@/components/leads/contact-finder';
import { LeadScoreBadge } from '@/components/leads/lead-score';
import { LostReasonDialog } from '@/components/leads/lost-reason';
import { WhatsAppMenu } from '@/components/leads/whatsapp-menu';
import { ContactScriptsCard } from '@/components/scripts/contact-scripts-card';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useProspectingOutcome, useProspectingQueue, useSettings } from '@/lib/queries';
import { cn, displayHost, telUrl, whatsappUrl } from '@/lib/utils';
import { SequenceStep } from './sequence-step';

const KIND_ICON: Record<ProspectingItem['kind'], typeof Eye> = {
  opened: Eye,
  follow_up: CalendarClock,
  new: Sparkles,
};

const LATER = [
  { days: 1, label: 'Amanhã' },
  { days: 3, label: 'Daqui a 3 dias' },
  { days: 7, label: 'Daqui a 1 semana' },
  { days: 14, label: 'Daqui a 2 semanas' },
  { days: 30, label: 'Daqui a 1 mês' },
];

/** Separadores: os da fila do servidor e "Falta contacto" (os da lista toda sem telefone nem email). */
type View = ProspectingFilter | 'missing';
const VIEWS: { value: View; label: string }[] = [
  ...PROSPECTING_FILTERS.map((f) => ({
    value: f as View,
    label: PROSPECTING_FILTER_LABELS[f],
  })),
  { value: 'missing', label: 'Falta contacto' },
];

const PAGE = 25;
const NO_ATTEMPTS: ProspectingAttempts = {
  no_answer: 0,
  contacted: 0,
  no_answer_streak: 0,
};
const hasContact = (lead: Lead) => !!(lead.phone || lead.email);

/** O que se registou nesta sessão (fica à vista na linha). */
type Done = {
  outcome: ProspectingOutcome;
  text: string;
  tone: 'neutral' | 'success' | 'danger' | 'warning';
};

function doneLabel(outcome: ProspectingOutcome, lead: Lead, attempts: ProspectingAttempts): Done {
  const on = lead.next_action_on ? formatDate(lead.next_action_on) : null;
  switch (outcome) {
    case 'no_answer':
      return {
        outcome,
        tone: 'warning',
        text: `Não atendeu (${attempts.no_answer}.ª vez)${on ? ` · volta a ${on}` : ''}`,
      };
    case 'contacted':
      return {
        outcome,
        tone: 'neutral',
        text: `Contactado (${attempts.contacted}.ª vez)${on ? ` · próximo a ${on}` : ''}`,
      };
    case 'interested':
      return { outcome, tone: 'success', text: 'Interessado' };
    case 'later':
      return {
        outcome,
        tone: 'neutral',
        text: `Mais tarde${on ? ` · ${on}` : ''}`,
      };
    case 'not_interested':
      return { outcome, tone: 'danger', text: 'Sem interesse' };
  }
}

export function ProspectingSession() {
  const [view, setView] = useState<View>('all');
  const { data, isLoading, refetch, isFetching } = useProspectingQueue(view === 'missing' ? 'all' : view);
  // O que mudou nesta sessão em cada lead (lead atualizado, contagens, último resultado).
  const [local, setLocal] = useState<Record<string, { item: ProspectingItem; done?: Done }>>({});
  // Os tratados, do mais recente para o mais antigo.
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [doneOpen, setDoneOpen] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [doneToday, setDoneToday] = useState<number | null>(null);

  const items = data?.items ?? [];
  // Falta contacto: decide-se pelo lead como veio da fila (guardar um telefone não o faz saltar de separador).
  const missing = items.filter((i) => !hasContact(i.lead));
  const pending = (view === 'missing' ? missing : items.filter((i) => hasContact(i.lead)))
    .filter((i) => !local[i.lead.id]?.done)
    .map((i) => local[i.lead.id]?.item ?? i);
  const done = doneIds.map((id) => local[id]).filter((d) => !!d);
  const today = doneToday ?? data?.done_today ?? 0;

  function changeView(next: View) {
    setLimit(PAGE);
    setView(next);
    if (next === view) void refetch();
  }

  function saved(item: ProspectingItem, lead: Lead) {
    setLocal((l) => ({
      ...l,
      [lead.id]: {
        ...l[lead.id],
        item: { ...(l[lead.id]?.item ?? item), lead },
      },
    }));
  }

  function recorded(item: ProspectingItem, outcome: ProspectingOutcome, result: ProspectingResult) {
    const before = item.attempts ?? NO_ATTEMPTS;
    const attempts: ProspectingAttempts = {
      no_answer: before.no_answer + (outcome === 'no_answer' ? 1 : 0),
      contacted: before.contacted + (outcome === 'contacted' ? 1 : 0),
      no_answer_streak: outcome === 'no_answer' ? before.no_answer_streak + 1 : 0,
    };
    // Depois de "Contactado"/"Interessado" a sequência já avançou: o passo antigo deixa de valer.
    const next: ProspectingItem = {
      ...item,
      lead: result.lead,
      attempts,
      sequence: outcome === 'no_answer' ? item.sequence : null,
    };
    setLocal((l) => ({
      ...l,
      [item.lead.id]: {
        item: next,
        done: doneLabel(outcome, result.lead, attempts),
      },
    }));
    setDoneIds((ids) => [item.lead.id, ...ids.filter((id) => id !== item.lead.id)]);
    setDoneToday(result.done_today);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Que leads" className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => changeView(v.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === v.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" aria-live="polite">
          <span>
            Nesta sessão: <strong className="text-fg tabular">{done.length}</strong>
          </span>
          <span>
            Hoje: <strong className="text-fg tabular">{today}</strong> contacto
            {today === 1 ? '' : 's'}
          </span>
          {data ? (
            <span>
              Faltam <strong className="text-fg tabular">{pending.length}</strong>
            </span>
          ) : null}
        </p>
      </div>
      <p className="text-sm text-muted">
        {view === 'missing'
          ? 'Leads da lista sem telefone nem email: procura o contacto (Google, Maps, redes sociais ou automaticamente) e guarda-o; depois já os podes contactar aqui.'
          : 'Contacta e regista o resultado na própria linha. O lead passa para “Feito nesta sessão”, onde vês a contagem (1×, 2×…) e podes registar outra tentativa.'}
      </p>

      {isLoading ? <Skeleton className="h-96" /> : null}

      {data && !pending.length ? (
        <Card>
          {view === 'missing' ? (
            <EmptyState title="Nenhum lead sem contacto">
              <p>Todos os leads da lista têm telefone ou email.</p>
            </EmptyState>
          ) : (
            <EmptyState title={done.length ? 'Terminaste a lista! 🎉' : 'Não há leads para contactar agora'}>
              <p>
                {done.length
                  ? `Registaste ${done.length} contacto${done.length === 1 ? '' : 's'} nesta sessão.`
                  : 'Os follow-ups de hoje estão feitos e não há leads por contactar. Gera novos leads ou importa uma lista.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => changeView(view)} loading={isFetching}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Recarregar a lista
                </Button>
                <Link href="/gerar-leads" className={buttonClasses('primary', 'md')}>
                  <Sparkles className="h-4 w-4" aria-hidden /> Gerar leads
                </Link>
              </div>
            </EmptyState>
          )}
        </Card>
      ) : null}

      {pending.length ? (
        <Card>
          <ul aria-label={view === 'missing' ? 'Leads sem contacto' : 'Leads para contactar'} className="divide-y divide-border">
            {pending.slice(0, limit).map((item) => (
              <LeadRow
                key={item.lead.id}
                item={item}
                onSaved={(lead) => saved(item, lead)}
                onRecorded={(outcome, result) => recorded(item, outcome, result)}
              />
            ))}
          </ul>
          {pending.length > limit ? (
            <div className="flex justify-center border-t border-border p-3">
              <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                <ChevronDown className="h-4 w-4" aria-hidden /> Mostrar mais ({pending.length - limit})
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {view !== 'missing' && data && missing.length ? (
        <button type="button" onClick={() => changeView('missing')} className="self-start text-sm text-accent-text hover:underline">
          {missing.length} lead{missing.length === 1 ? '' : 's'} desta lista sem telefone nem email → Falta contacto
        </button>
      ) : null}

      {done.length ? (
        <section aria-label="Feito nesta sessão" className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen(!doneOpen)}
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !doneOpen && '-rotate-90')} aria-hidden />
            Feito nesta sessão ({done.length})
          </button>
          {doneOpen ? (
            <Card>
              <ul aria-label="Leads tratados nesta sessão" className="divide-y divide-border">
                {done.map(({ item, done: result }) => (
                  <LeadRow
                    key={item.lead.id}
                    item={item}
                    done={result}
                    onSaved={(lead) => saved(item, lead)}
                    onRecorded={(outcome, r) => recorded(item, outcome, r)}
                  />
                ))}
              </ul>
            </Card>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function LeadRow({
  item,
  done,
  onSaved,
  onRecorded,
}: {
  item: ProspectingItem;
  done?: Done;
  onSaved: (lead: Lead) => void;
  onRecorded: (outcome: ProspectingOutcome, result: ProspectingResult) => void;
}) {
  const lead = item.lead;
  const { data: settings } = useSettings();
  const outcome = useProspectingOutcome();
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [finder, setFinder] = useState(false);
  const [askLost, setAskLost] = useState(false);
  const [askGiveUp, setAskGiveUp] = useState(false);
  const attempts = item.attempts ?? NO_ATTEMPTS;
  const streak = attempts.no_answer_streak;
  const KindIcon = KIND_ICON[item.kind];
  const wa = whatsappUrl(lead.phone);
  const headingId = `prosp-${lead.id}`;
  const busy = outcome.isPending;

  async function record(value: ProspectingOutcome, days?: number, lostReason?: LostReason | null, retryOn?: string | null) {
    setAskLost(false);
    setAskGiveUp(false);
    try {
      const result = await outcome.mutateAsync({
        leadId: lead.id,
        outcome: value,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(days ? { days } : {}),
        ...(lostReason ? { lost_reason: lostReason } : {}),
        ...(retryOn ? { retry_on: retryOn } : {}),
      });
      const next = result.lead.next_action_on ? ` Próxima ação a ${formatDate(result.lead.next_action_on)}.` : '';
      const times =
        value === 'no_answer'
          ? ` — Não atendeu (${attempts.no_answer + 1}.ª vez); volta a aparecer${result.lead.next_action_on ? ` a ${formatDate(result.lead.next_action_on)}` : ' amanhã'}.`
          : value === 'contacted'
            ? ` — Contactado (${attempts.contacted + 1}.ª vez).${next}`
            : `.${next}`;
      toast.success(`#${lead.number} ${lead.company_name}: registado${times}`);
      setNote('');
      setNoteOpen(false);
      onRecorded(value, result);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const meta = [lead.contact_name, lead.sector?.name, lead.city].filter(Boolean).join(' · ');

  return (
    <li aria-labelledby={headingId} className={cn('flex flex-col gap-3 p-3 sm:p-4', done && 'bg-surface-2/30')}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="font-sans text-base font-semibold break-words">
            <span className="text-muted tabular">#{lead.number}</span> {lead.company_name}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-start gap-1.5">
              <KindIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden />
              {item.reason}
            </span>
            {meta ? <span>{meta}</span> : null}
            {item.sequence ? (
              <span className="inline-flex items-center gap-1 text-accent-text">
                <Route className="h-3.5 w-3.5" aria-hidden /> Passo {item.sequence.step} de {item.sequence.total}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {done ? <Badge tone={done.tone}>{done.text}</Badge> : null}
          <StatusBadge status={lead.status} />
          <LeadScoreBadge lead={lead} />
        </div>
      </div>

      {/* A nota afixada (ex.: "Só atende depois das 15h") à vista antes de ligar. */}
      {lead.pinned_note ? (
        <p role="note" aria-label="Nota afixada" className="-mt-1 flex items-start gap-1.5 text-sm font-medium text-warning">
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {lead.pinned_note}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Contactar" className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap [&>*]:justify-center">
          {lead.phone ? (
            <a href={telUrl(lead.phone)} className={buttonClasses('primary', 'sm')}>
              <Phone className="h-3.5 w-3.5" aria-hidden /> Ligar
            </a>
          ) : null}
          {wa ? (
            settings?.features.whatsapp_templates ? (
              <WhatsAppMenu lead={lead} className={buttonClasses('outline', 'sm')} />
            ) : (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm')}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
              </a>
            )
          ) : null}
          {lead.email ? (
            <SendEmailButton
              lead={lead}
              label="Email"
              variant="outline"
              subject={lead.email_subject ?? ''}
              body={lead.email_body ?? ''}
              template="Email de prospeção"
            />
          ) : null}
          {!lead.phone || !lead.email ? (
            <Button size="sm" variant="ghost" aria-expanded={finder} onClick={() => setFinder(!finder)}>
              <Search className="h-3.5 w-3.5" aria-hidden />{' '}
              {hasContact(lead) ? `Procurar ${lead.phone ? 'email' : 'telefone'}` : 'Procurar contacto'}
            </Button>
          ) : null}
        </nav>

        <div
          role="group"
          aria-label="Resultado do contacto"
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&_button]:whitespace-nowrap [&_svg]:shrink-0 max-sm:[&>:last-child]:col-span-2"
        >
          <Button
            size="sm"
            variant="outline"
            // À 3.ª vez seguida sem atender, pergunta se passa a "Sem interesse" (Não responde).
            onClick={() => (streak >= NO_ANSWER_LIMIT - 1 ? setAskGiveUp(true) : void record('no_answer'))}
            disabled={busy}
          >
            <PhoneOff className="h-3.5 w-3.5" aria-hidden /> Não atendeu
            <AttemptCount n={attempts.no_answer} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => void record('contacted')} disabled={busy}>
            <UserCheck className="h-3.5 w-3.5" aria-hidden /> {item.sequence ? `Contactado (passo ${item.sequence.step})` : 'Contactado'}
            <AttemptCount n={attempts.contacted} />
          </Button>
          <Button size="sm" onClick={() => void record('interested')} disabled={busy}>
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Interessado
          </Button>
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Mais tarde
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              {LATER.map((l) => (
                <DropdownItem key={l.days} onSelect={() => void record('later', l.days)}>
                  {l.label}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownRoot>
          <Button size="sm" variant="outline" onClick={() => setAskLost(true)} disabled={busy}>
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden /> Sem interesse
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button
          type="button"
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen(!noteOpen)}
          className="inline-flex items-center gap-1.5 text-muted hover:text-fg"
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden /> {note.trim() ? 'Nota (por guardar)' : 'Nota'}
        </button>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
          className="inline-flex items-center gap-1.5 text-muted hover:text-fg"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', more && 'rotate-180')} aria-hidden />{' '}
          {more ? 'Ver menos' : 'Ver mais'}
        </button>
        <Link href={leadPath(lead)} target="_blank" className="inline-flex items-center gap-1.5 text-muted hover:text-fg">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ficha
          <span className="sr-only">(abre num novo separador)</span>
        </Link>
      </div>

      {noteOpen ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`note-${lead.id}`} className="text-sm font-medium">
            Nota (opcional)
          </label>
          <Textarea
            id={`note-${lead.id}`}
            rows={2}
            maxLength={2000}
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: falei com a dona, pediu para ligar depois das 15h"
          />
          <p className="text-xs text-muted">Fica guardada com o próximo resultado que registares.</p>
        </div>
      ) : null}

      {finder ? <ContactFinder key={lead.updated_at} lead={lead} onSaved={onSaved} /> : null}

      {more ? <LeadDetails item={item} /> : null}

      {askGiveUp ? (
        <Dialog
          open
          onOpenChange={(o) => (!o ? setAskGiveUp(false) : undefined)}
          title={`${streak + 1}.ª vez sem resposta`}
          description={`#${lead.number} ${lead.company_name} não atendeu as últimas ${streak} vezes. Passar a “Sem interesse” (Não responde)?`}
          className="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => void record('no_answer')}>
                Só registar “Não atendeu”
              </Button>
              <Button onClick={() => void record('not_interested', undefined, 'nao_responde')}>Passar a Sem interesse</Button>
            </>
          }
        >
          <p className="text-sm text-muted">
            Fica em Estatísticas → Porque perdes leads, com o motivo “Não responde”. Podes sempre voltar a mudar o estado na ficha.
          </p>
        </Dialog>
      ) : null}
      {askLost ? (
        <LostReasonDialog
          open
          subject={`#${lead.number} ${lead.company_name}`}
          onPick={(reason, retryOn) => void record('not_interested', undefined, reason, retryOn)}
          onCancel={() => setAskLost(false)}
        />
      ) : null}
    </li>
  );
}

/** "Ver mais": o passo da sequência, o ângulo, os problemas do site, as notas e os scripts. */
function LeadDetails({ item }: { item: ProspectingItem }) {
  const lead = item.lead;
  const [scripts, setScripts] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-2/50 p-3">
      {item.sequence ? <SequenceStep lead={lead} step={item.sequence} /> : null}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {lead.approach_angle ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">Ângulo de abordagem</dt>
            <dd className="mt-0.5">{lead.approach_angle}</dd>
          </div>
        ) : null}
        {lead.problems ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">Problemas do site</dt>
            <dd className="mt-0.5 whitespace-pre-line">{lead.problems}</dd>
          </div>
        ) : null}
        {lead.score_reasons?.length ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">Porque é quente</dt>
            <dd className="mt-0.5 flex items-start gap-1.5">
              <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              {lead.score_reasons.slice(0, 3).join(' · ')}
            </dd>
          </div>
        ) : null}
        {lead.notes ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">Notas</dt>
            <dd className="mt-0.5 line-clamp-4 whitespace-pre-line">{lead.notes}</dd>
          </div>
        ) : null}
        {lead.website ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted uppercase">Site</dt>
            <dd className="mt-0.5">
              <a href={lead.website} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
                {displayHost(lead.website)}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <button
        type="button"
        onClick={() => setScripts((v) => !v)}
        aria-expanded={scripts}
        className="self-start text-sm text-accent-text hover:underline"
      >
        {scripts ? 'Esconder scripts' : 'Ver scripts'}
      </button>
      {scripts ? <ContactScriptsCard lead={lead} /> : null}
    </div>
  );
}

/** "2×" no botão: quantas vezes já se registou este resultado neste lead (sempre à vista, também o 0). */
function AttemptCount({ n }: { n: number }) {
  return (
    <span
      className={cn(
        'ml-0.5 rounded-full px-1.5 py-px text-xs font-semibold tabular',
        n ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-muted',
      )}
      title="Vezes que já registaste este resultado neste lead"
    >
      {n}×<span className="sr-only"> ({n === 1 ? '1 vez' : `${n} vezes`} até agora)</span>
    </span>
  );
}
