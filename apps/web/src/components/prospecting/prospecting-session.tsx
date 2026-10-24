'use client';

/**
 * Sessão de prospeção: um lead de cada vez, com tudo à mão para o contactar
 * (ligar, WhatsApp, email, script) e o resultado registado com um toque.
 * A fila carrega-se ao abrir; cada resultado tira o lead da fila e passa ao seguinte.
 */
import {
  NO_ANSWER_LIMIT,
  PROSPECTING_FILTER_LABELS,
  PROSPECTING_FILTERS,
  formatDate,
  leadPath,
  type ProspectingFilter,
  type ProspectingItem,
  type LostReason,
  type ProspectingOutcome,
} from '@vndesign/core';
import {
  CalendarClock,
  ChevronRight,
  Eye,
  Flame,
  Globe,
  MessageCircle,
  Phone,
  PhoneOff,
  RotateCcw,
  SkipForward,
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
import { WhatsAppMenu } from '@/components/leads/whatsapp-menu';
import { ContactScriptsCard } from '@/components/scripts/contact-scripts-card';
import { SequenceStep } from './sequence-step';
import { Button, buttonClasses } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useProspectingOutcome, useProspectingQueue, useSettings } from '@/lib/queries';
import { cn, displayHost, telUrl, whatsappUrl } from '@/lib/utils';
import { PinnedNoteBox } from '@/components/leads/pinned-note';
import { LostReasonDialog } from '@/components/leads/lost-reason';
import { Dialog } from '@/components/ui/dialog';

const KIND_META: Record<ProspectingItem['kind'], { label: string; icon: typeof Eye; tone: 'success' | 'warning' | 'neutral' }> = {
  opened: { label: 'Abriu o email', icon: Eye, tone: 'success' },
  follow_up: { label: 'Follow-up', icon: CalendarClock, tone: 'warning' },
  new: { label: 'Por contactar', icon: Sparkles, tone: 'neutral' },
};

const LATER = [
  { days: 1, label: 'Amanhã' },
  { days: 3, label: 'Daqui a 3 dias' },
  { days: 7, label: 'Daqui a 1 semana' },
  { days: 14, label: 'Daqui a 2 semanas' },
  { days: 30, label: 'Daqui a 1 mês' },
];

export function ProspectingSession() {
  const [filter, setFilter] = useState<ProspectingFilter>('all');
  const { data, isLoading, refetch, isFetching } = useProspectingQueue(filter);
  // Leads já tratados ou saltados nesta sessão (a fila do servidor não muda a meio).
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [session, setSession] = useState(0);
  const [doneToday, setDoneToday] = useState<number | null>(null);

  const pending = (data?.items ?? []).filter((i) => !handled.has(i.lead.id));
  // Os saltados vão para o fim da fila.
  const queue = [...pending.filter((i) => !skipped.includes(i.lead.id)), ...skipped.map((id) => pending.find((i) => i.lead.id === id)).filter((i) => !!i)];
  const current = queue[0] ?? null;

  function restart(next: ProspectingFilter = filter) {
    setHandled(new Set());
    setSkipped([]);
    setFilter(next);
    if (next === filter) void refetch();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Que leads" className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
          {PROSPECTING_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => restart(f)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === f ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {PROSPECTING_FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-3 text-sm text-muted" aria-live="polite">
          <span>
            Nesta sessão: <strong className="text-fg tabular">{session}</strong>
          </span>
          <span>
            Hoje: <strong className="text-fg tabular">{doneToday ?? data?.done_today ?? 0}</strong> contacto{(doneToday ?? data?.done_today) === 1 ? '' : 's'}
          </span>
          {data ? (
            <span>
              Faltam <strong className="text-fg tabular">{queue.length}</strong>
            </span>
          ) : null}
        </p>
      </div>

      {isLoading ? <Skeleton className="h-96" /> : null}
      {data && !current ? (
        <Card>
          <EmptyState title={data.items.length ? 'Terminaste a lista! 🎉' : 'Não há leads para contactar agora'}>
            <p>
              {data.items.length
                ? `Registaste ${session} contacto${session === 1 ? '' : 's'} nesta sessão.`
                : 'Os follow-ups de hoje estão feitos e não há leads por contactar. Gera novos leads ou importa uma lista.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => restart()} loading={isFetching}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Recarregar a lista
              </Button>
              <Link href="/gerar-leads" className={buttonClasses('primary', 'md')}>
                <Sparkles className="h-4 w-4" aria-hidden /> Gerar leads
              </Link>
            </div>
          </EmptyState>
        </Card>
      ) : null}
      {current ? (
        <LeadCard
          key={current.lead.id}
          item={current}
          position={(data?.items.length ?? 0) - queue.length + 1}
          total={data?.items.length ?? 0}
          onDone={(n) => {
            setHandled((h) => new Set(h).add(current.lead.id));
            setSession((v) => v + 1);
            setDoneToday(n);
          }}
          onSkip={() => setSkipped((s) => [...s.filter((id) => id !== current.lead.id), current.lead.id])}
        />
      ) : null}
    </div>
  );
}

function LeadCard({
  item,
  position,
  total,
  onDone,
  onSkip,
}: {
  item: ProspectingItem;
  position: number;
  total: number;
  onDone: (doneToday: number) => void;
  onSkip: () => void;
}) {
  // Depois de guardar contactos encontrados, o cartão passa a usar o lead atualizado.
  const [saved, setSaved] = useState<typeof item.lead | null>(null);
  const lead = saved ?? item.lead;
  const { data: settings } = useSettings();
  const outcome = useProspectingOutcome();
  const [note, setNote] = useState('');
  const [scripts, setScripts] = useState(false);
  const kind = KIND_META[item.kind];
  const KindIcon = kind.icon;
  const wa = whatsappUrl(lead.phone);

  // "Sem interesse": pergunta primeiro o motivo (como na ficha e no Kanban).
  const [askLost, setAskLost] = useState(false);
  // Tentativas: quantas vezes já se carregou em "Não atendeu" e "Contactado" neste lead.
  const attempts = item.attempts ?? { no_answer: 0, contacted: 0, no_answer_streak: 0 };
  const streak = attempts.no_answer_streak;
  const [askGiveUp, setAskGiveUp] = useState(false);

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
      toast.success(`#${lead.number} ${lead.company_name}: registado.${next}`);
      onDone(result.done_today);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="tabular">
            Lead {position} de {total}
          </span>
          <Badge tone={kind.tone} className="inline-flex items-center gap-1">
            <KindIcon className="h-3.5 w-3.5" aria-hidden /> {kind.label}
          </Badge>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold break-words sm:text-2xl">
              <span className="text-muted tabular">#{lead.number}</span> {lead.company_name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {[lead.contact_name, lead.sector?.name, lead.city].filter(Boolean).join(' · ') || 'Sem contacto nem setor'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={lead.status} />
            <LeadScoreBadge lead={lead} />
          </div>
        </div>
        {/* A nota afixada na ficha (ex.: "Só atende depois das 15h") à vista antes de ligar. */}
        <PinnedNoteBox note={lead.pinned_note} />
        <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <KindIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
          <span>{item.reason}</span>
        </p>
        {item.sequence ? <SequenceStep lead={lead} step={item.sequence} /> : null}

        <nav aria-label="Contactar" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {lead.phone ? (
            <a href={telUrl(lead.phone)} className={buttonClasses('primary', 'md', 'justify-center')}>
              <Phone className="h-4 w-4" aria-hidden /> Ligar
            </a>
          ) : null}
          {wa ? (
            settings?.features.whatsapp_templates ? (
              <WhatsAppMenu lead={lead} className={buttonClasses('outline', 'md', 'justify-center')} />
            ) : (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'md', 'justify-center')}>
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
            )
          ) : null}
          {lead.email ? (
            <SendEmailButton
              lead={lead}
              label="Email"
              variant="outline"
              size="md"
              subject={lead.email_subject ?? ''}
              body={lead.email_body ?? ''}
              template="Email de prospeção"
            />
          ) : null}
          {lead.website ? (
            <a href={lead.website} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'md', 'col-span-2 min-w-0 justify-center')}>
              <Globe className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{displayHost(lead.website)}</span>
            </a>
          ) : null}
        </nav>
        {!lead.phone || !lead.email ? <ContactFinder key={lead.updated_at} lead={lead} onSaved={setSaved} /> : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
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
        <div className="sm:col-span-2">
          <Link href={leadPath(lead)} target="_blank" className="inline-flex items-center gap-1 text-sm text-accent-text hover:underline">
            Abrir a ficha completa <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(abre num novo separador)</span>
          </Link>
          <button type="button" onClick={() => setScripts((v) => !v)} aria-expanded={scripts} className="ml-4 text-sm text-accent-text hover:underline">
            {scripts ? 'Esconder scripts' : 'Ver scripts'}
          </button>
        </div>
      </dl>
      {scripts ? (
        <div className="border-t border-border p-3">
          <ContactScriptsCard lead={lead} />
        </div>
      ) : null}

      <section aria-label="Resultado do contacto" className="flex flex-col gap-3 border-t border-border bg-surface-2/40 p-4 sm:p-5">
        <label htmlFor={`note-${lead.id}`} className="text-sm font-medium">
          Nota (opcional)
        </label>
        <Textarea id={`note-${lead.id}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: falei com a dona, pediu para ligar depois das 15h" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Button
            variant="outline"
            // À 3.ª vez seguida sem atender, pergunta se passa a "Sem interesse" (Não responde).
            onClick={() => (streak >= NO_ANSWER_LIMIT - 1 ? setAskGiveUp(true) : void record('no_answer'))}
            disabled={outcome.isPending}
          >
            <PhoneOff className="h-4 w-4" aria-hidden /> Não atendeu
            <AttemptCount n={attempts.no_answer} />
          </Button>
          <Button variant="outline" onClick={() => record('contacted')} disabled={outcome.isPending}>
            <UserCheck className="h-4 w-4" aria-hidden /> {item.sequence ? `Contactado (passo ${item.sequence.step})` : 'Contactado'}
            <AttemptCount n={attempts.contacted} />
          </Button>
          <Button onClick={() => record('interested')} disabled={outcome.isPending}>
            <ThumbsUp className="h-4 w-4" aria-hidden /> Interessado
          </Button>
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button variant="outline" disabled={outcome.isPending}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Mais tarde
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
          <Button variant="outline" onClick={() => setAskLost(true)} disabled={outcome.isPending}>
            <ThumbsDown className="h-4 w-4" aria-hidden /> Sem interesse
          </Button>
          <Button variant="ghost" onClick={onSkip} disabled={outcome.isPending}>
            <SkipForward className="h-4 w-4" aria-hidden /> Saltar
          </Button>
        </div>
        <p className="text-xs text-muted">
          “Contactado” agenda o próximo follow-up; “Não atendeu” volta a mostrar o lead amanhã; “Interessado” passa-o a Respondeu, com
          a próxima ação para hoje.
        </p>
      </section>
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
          <p className="text-sm text-muted">Fica em Estatísticas → Porque perdes leads, com o motivo “Não responde”. Podes sempre voltar a mudar o estado na ficha.</p>
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
    </Card>
  );
}

/** "2×" no botão: quantas vezes já se registou este resultado neste lead. */
function AttemptCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="rounded-full bg-surface-3 px-1.5 text-xs font-medium text-muted tabular" title="Vezes que já registaste este resultado">
      {n}×<span className="sr-only"> ({n === 1 ? '1 vez' : `${n} vezes`} até agora)</span>
    </span>
  );
}
