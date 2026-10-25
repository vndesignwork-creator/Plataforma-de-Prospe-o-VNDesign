'use client';

/**
 * Sessão de prospeção: a lista de contactos do dia, por email (por omissão) ou
 * por telefone — a escolha fica na conta de cada pessoa.
 *  - Email: o botão de cada linha abre o 1.º email (ou o follow-up seguinte) já
 *    escrito; ao enviar, o lead passa a Contactado e o próximo follow-up fica
 *    marcado sozinho. Os resultados de uma chamada ficam no menu "Registar".
 *  - Telefone: Ligar, WhatsApp e os resultados com um toque (Não atendeu 2×…).
 * O lead não salta: passa para "Feito nesta sessão". Os leads sem email (ou sem
 * contacto nenhum, a telefonar) ficam num separador próprio, com o "Procurar".
 */
import {
  NO_ANSWER_LIMIT,
  PROSPECTING_FILTER_LABELS,
  PROSPECTING_FILTERS,
  formatDate,
  leadPath,
  PROSPECTING_MODE_LABELS,
  PROSPECTING_MODE_PREFERENCE,
  PROSPECTING_MODES,
  leadServiceCategory,
  renderTemplate,
  type Lead,
  type LeadEmailSendResult,
  type LostReason,
  type ProspectingMode,
  type ProspectingAttempts,
  type ProspectingFilter,
  type ProspectingItem,
  type ProspectingOutcome,
  type ProspectingResult,
} from '@vndesign/core';
import {
  CalendarClock,
  ChevronDown,
  Mail,
  ExternalLink,
  Eye,
  Flame,
  MessageCircle,
  NotebookPen,
  Phone,
  PhoneOff,
  Pin,
  PenLine,
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
import { FollowUpEmailButton, SendEmailButton } from '@/components/email/send-email-dialog';
import { StatusBadge } from '@/components/leads/badges';
import { ContactFinder } from '@/components/leads/contact-finder';
import { LeadScoreBadge } from '@/components/leads/lead-score';
import { LostReasonDialog } from '@/components/leads/lost-reason';
import { WhatsAppMenu } from '@/components/leads/whatsapp-menu';
import { ContactScriptsCard } from '@/components/scripts/contact-scripts-card';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownRoot, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { useServiceCatalog } from '@/components/services/services';
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { usePreference, useProspectingOutcome, useProspectingQueue, useSetPreference, useSettings, useTemplates } from '@/lib/queries';
import { useTemplateContext } from '@/lib/template-context';
import { cn, displayHost, telUrl, whatsappUrl } from '@/lib/utils';
import { SequenceStep, pickTemplate } from './sequence-step';

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

/** Separadores: os da fila do servidor e "Falta email" / "Falta contacto" (os da lista toda sem forma de contactar). */
type View = ProspectingFilter | 'missing';
const views = (mode: ProspectingMode): { value: View; label: string }[] => [
  ...PROSPECTING_FILTERS.map((f) => ({ value: f as View, label: PROSPECTING_FILTER_LABELS[f] })),
  { value: 'missing', label: mode === 'email' ? 'Falta email' : 'Falta contacto' },
];

const PAGE = 25;
const NO_ATTEMPTS: ProspectingAttempts = {
  no_answer: 0,
  contacted: 0,
  no_answer_streak: 0,
};
const hasContact = (lead: Lead) => !!(lead.phone || lead.email);
/** A email: sem email não há nada a enviar; a telefonar: basta um telefone ou um email. */
// Um email devolvido não conta (o endereço não existe): o lead vai para "Falta email".
const reachable = (lead: Lead, mode: ProspectingMode) => (mode === 'email' ? !!lead.email && !lead.email_bounced_at : hasContact(lead));

/** O que se registou nesta sessão (fica à vista na linha). */
type Done = {
  outcome: ProspectingOutcome | 'email';
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

/** Depois de enviar um email: o lead como fica (Contactado, próximo follow-up) e o que se mostra na linha. */
function afterEmail(lead: Lead, result: LeadEmailSendResult): { lead: Lead; done: Done } {
  const next: Lead = {
    ...lead,
    status: result.status_changed && lead.status === 'identificado' ? 'contactado' : lead.status,
    next_action_on: result.next_action_on,
    next_action_text: result.next_action_text ?? lead.next_action_text,
  };
  const on = result.next_action_on ? formatDate(result.next_action_on) : null;
  return { lead: next, done: { outcome: 'email', tone: 'success', text: `Email enviado${on ? ` · próximo a ${on}` : ''}` } };
}

export function ProspectingSession() {
  const { data: modePref } = usePreference<ProspectingMode>(PROSPECTING_MODE_PREFERENCE);
  const setModePref = useSetPreference<ProspectingMode>(PROSPECTING_MODE_PREFERENCE);
  const mode: ProspectingMode = modePref === 'phone' ? 'phone' : 'email';
  const [view, setView] = useState<View>('all');
  const { data, isLoading, refetch, isFetching } = useProspectingQueue(view === 'missing' ? 'all' : view);
  // O que mudou nesta sessão em cada lead (lead atualizado, contagens, último resultado).
  const [local, setLocal] = useState<Record<string, { item: ProspectingItem; done?: Done }>>({});
  // Os tratados, do mais recente para o mais antigo.
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [doneOpen, setDoneOpen] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [doneToday, setDoneToday] = useState<number | null>(null);
  const [emailsSent, setEmailsSent] = useState(0);

  const items = data?.items ?? [];
  // Falta email/contacto: decide-se pelo lead como veio da fila (guardar um contacto não o faz saltar de separador).
  const missing = items.filter((i) => !reachable(i.lead, mode));
  const pending = (view === 'missing' ? missing : items.filter((i) => reachable(i.lead, mode)))
    .filter((i) => !local[i.lead.id]?.done)
    .map((i) => local[i.lead.id]?.item ?? i);
  const done = doneIds.map((id) => local[id]).filter((d) => !!d);
  const today = doneToday ?? data?.done_today ?? 0;
  const emailsToday = (data?.emails_today ?? 0) + emailsSent;

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

  function emailed(item: ProspectingItem, result: LeadEmailSendResult) {
    const { lead, done } = afterEmail(item.lead, result);
    setLocal((l) => ({ ...l, [lead.id]: { item: { ...(l[lead.id]?.item ?? item), lead }, done } }));
    setDoneIds((ids) => [lead.id, ...ids.filter((id) => id !== lead.id)]);
    setEmailsSent((n) => n + 1);
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
          {views(mode).map((v) => (
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
        <div role="radiogroup" aria-label="Trabalho por" className="flex items-center gap-1 text-sm">
          <span className="mr-1 text-muted">Trabalho por:</span>
          {PROSPECTING_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                if (m === mode) return;
                setModePref.mutate(m);
                setLimit(PAGE);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors',
                mode === m ? 'border-accent/60 bg-accent-soft text-accent-text' : 'border-border text-muted hover:text-fg',
              )}
            >
              {m === 'email' ? <Mail className="h-3.5 w-3.5" aria-hidden /> : <Phone className="h-3.5 w-3.5" aria-hidden />}
              {PROSPECTING_MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" aria-live="polite">
          <span>
            Nesta sessão: <strong className="text-fg tabular">{done.length}</strong>
          </span>
          {mode === 'email' ? (
            <span>
              Hoje: <strong className="text-fg tabular">{emailsToday}</strong> email{emailsToday === 1 ? '' : 's'} enviado{emailsToday === 1 ? '' : 's'}
            </span>
          ) : (
            <span>
              Hoje: <strong className="text-fg tabular">{today}</strong> contacto{today === 1 ? '' : 's'}
            </span>
          )}
          {data ? (
            <span>
              Faltam <strong className="text-fg tabular">{pending.length}</strong>
            </span>
          ) : null}
        </p>
      </div>
      <p className="text-sm text-muted">
        {view === 'missing'
          ? mode === 'email'
            ? 'Leads da lista sem email: procura-o (site, Google, Maps, redes sociais ou automaticamente) e guarda-o; depois já lhes podes escrever aqui.'
            : 'Leads da lista sem telefone nem email: procura o contacto (Google, Maps, redes sociais ou automaticamente) e guarda-o; depois já os podes contactar aqui.'
          : mode === 'email'
            ? 'Cada linha tem o email pronto a rever e enviar (o 1.º ou o follow-up seguinte). Ao enviar, o lead passa a Contactado e o próximo follow-up fica marcado — não precisas de registar nada. Ligaste? Usa “Registar”.'
            : 'Contacta e regista o resultado na própria linha. O lead passa para “Feito nesta sessão”, onde vês a contagem (1×, 2×…) e podes registar outra tentativa.'}
      </p>

      {isLoading ? <Skeleton className="h-96" /> : null}

      {data && !pending.length ? (
        <Card>
          {view === 'missing' ? (
            <EmptyState title={mode === 'email' ? 'Nenhum lead sem email' : 'Nenhum lead sem contacto'}>
              <p>{mode === 'email' ? 'Todos os leads da lista têm email.' : 'Todos os leads da lista têm telefone ou email.'}</p>
            </EmptyState>
          ) : (
            <EmptyState title={done.length ? 'Terminaste a lista! 🎉' : 'Não há leads para contactar agora'}>
              <p>
                {done.length
                  ? `Trataste ${done.length} lead${done.length === 1 ? '' : 's'} nesta sessão.`
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
                mode={mode}
                onSaved={(lead) => saved(item, lead)}
                onEmailed={(result) => emailed(item, result)}
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
          {missing.length} lead{missing.length === 1 ? '' : 's'} desta lista {mode === 'email' ? 'sem email → Falta email' : 'sem telefone nem email → Falta contacto'}
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
                    mode={mode}
                    done={result}
                    onSaved={(lead) => saved(item, lead)}
                    onEmailed={(r) => emailed(item, r)}
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
  mode,
  done,
  onSaved,
  onEmailed,
  onRecorded,
}: {
  item: ProspectingItem;
  mode: ProspectingMode;
  done?: Done;
  onSaved: (lead: Lead) => void;
  onEmailed: (result: LeadEmailSendResult) => void;
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
  // "Não atendeu" à 3.ª vez seguida pergunta se passa a "Sem interesse" (Não responde).
  const noAnswer = () => (streak >= NO_ANSWER_LIMIT - 1 ? setAskGiveUp(true) : void record('no_answer'));

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

      {mode === 'email' ? (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Contactar" className="flex flex-wrap gap-2">
            <EmailAction lead={lead} onSent={onEmailed} />
            {!lead.email || lead.email_bounced_at ? (
              <Button size="sm" variant="soft" aria-expanded={finder} onClick={() => setFinder(!finder)}>
                <Search className="h-3.5 w-3.5" aria-hidden /> Procurar email
              </Button>
            ) : null}
            {lead.phone ? (
              <a href={telUrl(lead.phone)} className={buttonClasses('ghost', 'sm')}>
                <Phone className="h-3.5 w-3.5" aria-hidden /> Ligar
              </a>
            ) : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
              </a>
            ) : null}
          </nav>
          {/* Uma chamada ou uma resposta por outra via: regista-se aqui (o email enviado já fica registado sozinho). */}
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy} className="self-start lg:self-auto">
                <PenLine className="h-3.5 w-3.5" aria-hidden /> Registar <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownLabel>Registar um contacto</DropdownLabel>
              <DropdownItem onSelect={() => void record('contacted')}>
                <UserCheck className="h-4 w-4 text-muted" aria-hidden /> Contactado ({attempts.contacted}×)
              </DropdownItem>
              <DropdownItem onSelect={noAnswer}>
                <PhoneOff className="h-4 w-4 text-muted" aria-hidden /> Não atendeu ({attempts.no_answer}×)
              </DropdownItem>
              <DropdownItem onSelect={() => void record('interested')}>
                <ThumbsUp className="h-4 w-4 text-success" aria-hidden /> Interessado
              </DropdownItem>
              <DropdownSeparator />
              <DropdownLabel>Mais tarde</DropdownLabel>
              {LATER.map((l) => (
                <DropdownItem key={l.days} onSelect={() => void record('later', l.days)}>
                  <CalendarClock className="h-4 w-4 text-muted" aria-hidden /> {l.label}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownItem onSelect={() => setAskLost(true)}>
                <ThumbsDown className="h-4 w-4 text-muted" aria-hidden /> Sem interesse…
              </DropdownItem>
            </DropdownContent>
          </DropdownRoot>
        </div>
      ) : (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Contactar" className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap [&>*]:justify-center">
            {lead.phone ? (
              <a href={telUrl(lead.phone)} className={buttonClasses('soft', 'sm')}>
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
              onClick={noAnswer}
              disabled={busy}
            >
              <PhoneOff className="h-3.5 w-3.5" aria-hidden /> Não atendeu
              <AttemptCount n={attempts.no_answer} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => void record('contacted')} disabled={busy}>
              <UserCheck className="h-3.5 w-3.5" aria-hidden /> {item.sequence ? `Contactado (passo ${item.sequence.step})` : 'Contactado'}
              <AttemptCount n={attempts.contacted} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => void record('interested')} disabled={busy}>
              <ThumbsUp className="h-3.5 w-3.5 text-success" aria-hidden /> Interessado
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
      )}

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

const FIRST_EMAIL_STEP = { step: 1, total: 1, day: 0, channel: 'email' as const, template_id: null };

/**
 * O email desta linha: o follow-up seguinte num lead contactado; o 1.º email num
 * lead novo (o escrito na ficha, ou o 1.º modelo de email preenchido); noutros
 * estados, um email em branco. Revê-se sempre antes de enviar.
 */
function EmailAction({ lead, onSent }: { lead: Lead; onSent: (result: LeadEmailSendResult) => void }) {
  const { data: templates } = useTemplates();
  const context = useTemplateContext(lead);
  const catalog = useServiceCatalog();
  if (!lead.email || lead.email_bounced_at) return null;
  if (lead.status === 'contactado') return <FollowUpEmailButton lead={lead} variant="soft" onSent={onSent} />;
  const first = lead.status === 'identificado';
  let subject = lead.email_subject ?? '';
  let body = lead.email_body ?? '';
  let template = 'Email de prospeção';
  if (first && !body.trim() && templates) {
    const t = pickTemplate(templates, FIRST_EMAIL_STEP, leadServiceCategory(lead.services, catalog.all) ?? null);
    if (t) {
      subject = t.subject ? renderTemplate(t.subject, context).text : '';
      body = renderTemplate(t.body, context).text;
      template = t.name;
    }
  }
  return (
    <SendEmailButton
      lead={lead}
      label={first ? 'Enviar 1.º email' : 'Enviar email'}
      variant="soft"
      subject={subject}
      body={body}
      template={template}
      onSent={onSent}
    />
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
