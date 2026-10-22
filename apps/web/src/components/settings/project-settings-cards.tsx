'use client';

/**
 * Definições → Funcionalidades (continuação): arranque automático do projeto,
 * perguntas do briefing, contratos (NIF e condições gerais), calculadora de
 * orçamento, tempos do Pomodoro e o calendário para subscrever no telemóvel.
 */
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_BRIEFING_QUESTIONS,
  DEFAULT_CONTRACT_CLAUSES,
  DEFAULT_POMODORO_SETTINGS,
  POMODORO_SOUNDS,
  POMODORO_SOUND_LABELS,
  DEFAULT_QUOTE_EXTRAS,
  KICKOFF_SPLITS,
  parseEuroAmount,
  type PomodoroSound,
  type QuoteExtra,
} from '@vndesign/core';
import { CalendarDays, Copy, Link2Off, Plus, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { playChime, unlockSound } from '@/lib/pomodoro-sound';
import { useCalendarFeed, useSetCalendarFeed, type SettingsWithMail } from '@/lib/queries';

const SPLIT_LABELS = ['50% de sinal + 50% na entrega', '30% + 40% + 30%', 'Pagamento único', 'Sem plano de pagamentos'];

function usePatchSettings() {
  const qc = useQueryClient();
  return async (body: Record<string, unknown>) => {
    const { data } = await api<{ data: SettingsWithMail }>('/settings', { method: 'PATCH', body });
    qc.setQueryData(['settings'], data);
    return data;
  };
}

function firstError(error: unknown): string | null {
  if (error instanceof ApiClientError && error.problem.errors) return Object.values(error.problem.errors as Record<string, string[]>)[0]?.[0] ?? null;
  return null;
}

export function KickoffCard({ settings }: { settings: SettingsWithMail }) {
  const patch = usePatchSettings();
  const current = KICKOFF_SPLITS.findIndex((s) => JSON.stringify(s) === JSON.stringify(settings.project_kickoff.payment_split));
  async function change(i: number) {
    try {
      await patch({ project_kickoff: { payment_split: [...KICKOFF_SPLITS[i]!] } });
      toast.success('Plano do arranque guardado.');
    } catch (error) {
      toast.error(firstError(error) ?? errorMessage(error));
    }
  }
  return (
    <Card>
      <CardHeader
        title="Arranque automático do projeto"
        description="Quando um lead passa a “Cliente”, o projeto prepara-se sozinho. Na ficha, “Preparar” faz o mesmo para clientes antigos."
      />
      <div className="flex flex-col gap-3 p-4 text-sm">
        <ul className="list-disc pl-5 text-muted">
          <li>
            <strong className="text-fg">Prazo e revisões</strong> de cada serviço, em{' '}
            <Link href="/definicoes/servicos" className="text-accent-text underline">
              Definições → Serviços
            </Link>
            .
          </li>
          <li>
            <strong className="text-fg">Tarefas</strong> das listas de cada serviço, em{' '}
            <Link href="/definicoes/listas-tarefas" className="text-accent-text underline">
              Listas de tarefas
            </Link>{' '}
            (se o cliente ainda não tiver tarefas).
          </li>
          <li>
            <strong className="text-fg">Plano de pagamentos</strong> sobre a proposta aceite (ou o valor estimado):
          </li>
        </ul>
        <Field label="Plano de pagamentos" className="max-w-sm">
          <Select value={String(current < 0 ? 0 : current)} onChange={(e) => void change(Number(e.target.value))}>
            {KICKOFF_SPLITS.map((_, i) => (
              <option key={i} value={String(i)}>
                {SPLIT_LABELS[i]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}

export function BriefingQuestionsCard({ settings }: { settings: SettingsWithMail }) {
  const patch = usePatchSettings();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = text ?? settings.briefing.questions.join('\n');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await patch({ briefing: { questions: value.split('\n').map((q) => q.trim()).filter(Boolean) } });
      setText(null);
      toast.success('Perguntas do briefing guardadas (valem para os próximos briefings).');
    } catch (err) {
      const msg = firstError(err);
      if (msg) setError(msg);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Briefing online" description="As perguntas do formulário que o cliente recebe (uma por linha)." />
      <form onSubmit={save} className="flex flex-col gap-3 p-4" noValidate>
        <Field label="Perguntas" error={error ?? undefined}>
          <Textarea rows={9} value={value} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setText(DEFAULT_BRIEFING_QUESTIONS.join('\n'))}>
            Repor as de origem
          </Button>
          <Button type="submit" loading={saving} disabled={text === null}>
            Guardar perguntas
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ContractSettingsCard({ settings }: { settings: SettingsWithMail }) {
  const patch = usePatchSettings();
  const [form, setForm] = useState<{ provider_nif: string; clauses: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = form ?? settings.contract;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await patch({ contract: value });
      setForm(null);
      toast.success('Contratos: guardado (vale para os próximos contratos).');
    } catch (err) {
      const msg = firstError(err);
      if (msg) setError(msg);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader title="Contratos" description="O teu NIF e as condições gerais que entram em cada contrato novo (uma por linha)." />
      <form onSubmit={save} className="flex flex-col gap-3 p-4" noValidate>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Field label="O teu NIF" className="max-w-xs">
          <Input inputMode="numeric" maxLength={20} value={value.provider_nif} onChange={(e) => setForm({ ...value, provider_nif: e.target.value })} />
        </Field>
        <Field label="Condições gerais">
          <Textarea rows={8} value={value.clauses} maxLength={5000} onChange={(e) => setForm({ ...value, clauses: e.target.value })} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setForm({ ...value, clauses: DEFAULT_CONTRACT_CLAUSES })}>
            Repor as de origem
          </Button>
          <Button type="submit" loading={saving} disabled={form === null}>
            Guardar condições
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function CalendarFeedCard() {
  const { data: feed } = useCalendarFeed();
  const set = useSetCalendarFeed();
  const url = feed?.token ? `${typeof window === 'undefined' ? '' : window.location.origin}/api/v1/calendar/${feed.token}.ics` : null;
  const webcal = url?.replace(/^https?:/, 'webcal:');

  async function toggle(enabled: boolean, regenerate = false) {
    try {
      await set.mutateAsync({ enabled, regenerate });
      toast.success(!enabled ? 'Link desligado.' : regenerate ? 'Link novo criado (volta a subscrever com o novo).' : 'Link do calendário criado.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Seleciona o link e copia manualmente.');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Calendário no telemóvel"
        description="Reuniões, entregas dos projetos, pagamentos previstos e tarefas no Google Calendar ou no calendário do iPhone. Atualiza-se sozinho."
        actions={
          url ? null : (
            <Button size="sm" onClick={() => void toggle(true)} loading={set.isPending}>
              <CalendarDays className="h-4 w-4" aria-hidden /> Criar link
            </Button>
          )
        }
      />
      {url ? (
        <div className="flex flex-col gap-3 p-4 text-sm">
          <Input readOnly value={url} aria-label="Link do calendário" onFocus={(e) => e.target.select()} className="text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar link
            </Button>
            <a href={webcal} className={buttonClasses('outline', 'sm')}>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Abrir no iPhone / Mac
            </a>
            <Button size="sm" variant="ghost" onClick={() => void toggle(true, true)} loading={set.isPending}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Novo link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void toggle(false)}>
              <Link2Off className="h-3.5 w-3.5" aria-hidden /> Desligar
            </Button>
          </div>
          <ol className="list-decimal pl-5 text-muted">
            <li>
              <strong className="text-fg">Google Calendar</strong> (no computador): calendar.google.com → “Outros calendários” → <strong>+</strong> → “A partir do URL” → cola o link → “Adicionar calendário”. Aparece também no telemóvel.
            </li>
            <li>
              <strong className="text-fg">iPhone</strong>: no telemóvel, toca em “Abrir no iPhone / Mac” → “Subscrever”.
            </li>
          </ol>
          <p className="text-xs text-muted">O link é pessoal: quem o tiver vê estes eventos. Se o partilhares por engano, carrega em “Novo link”.</p>
        </div>
      ) : null}
    </Card>
  );
}

/** Extra em edição (números como texto para aceitar "1,5"). */
interface DraftExtra {
  name: string;
  price: string;
  kind: QuoteExtra['kind'];
  unit: string;
  hours: string;
  recurring: boolean;
}
const num = (v: number) => String(v).replace('.', ',');
const toDraftExtra = (e: QuoteExtra): DraftExtra => ({ ...e, price: num(e.price), hours: num(e.hours) });

export function QuoteSettingsCard({ settings }: { settings: SettingsWithMail }) {
  const patch = usePatchSettings();
  const [target, setTarget] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftExtra[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const list = rows ?? settings.quote.extras.map(toDraftExtra);
  const targetValue = target ?? (settings.quote.hourly_target === null ? '' : num(settings.quote.hourly_target));
  const dirty = target !== null || rows !== null;

  function edit(i: number, change: Partial<DraftExtra>) {
    setRows(list.map((r, j) => (j === i ? { ...r, ...change } : r)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await patch({
        quote: {
          hourly_target: targetValue.trim() ? parseEuroAmount(targetValue) : null,
          extras: list
            .filter((r) => r.name.trim())
            .map((r) => ({
              name: r.name.trim(),
              price: parseEuroAmount(r.price) ?? 0,
              kind: r.kind,
              unit: r.unit.trim(),
              hours: parseEuroAmount(r.hours) ?? 0,
              recurring: r.kind === 'fixed' && r.recurring,
            })),
        },
      });
      setTarget(null);
      setRows(null);
      toast.success('Calculadora de orçamento guardada.');
    } catch (err) {
      const msg = firstError(err);
      if (msg) setError(msg);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Calculadora de orçamento"
        description="Os extras que podes juntar aos pacotes (na ficha: Propostas → Calcular) e quanto queres ganhar por hora."
      />
      <form onSubmit={save} className="flex flex-col gap-4 p-4" noValidate>
        <Field label="Objetivo por hora (€)" hint="Vazio = sem comparação." className="w-48">
          <Input inputMode="decimal" placeholder="35" value={targetValue} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Extras da calculadora</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-medium">Extra</th>
                <th className="py-1 pr-2 font-medium">Preço</th>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Unidade</th>
                <th className="py-1 pr-2 font-medium">Horas/unid.</th>
                <th className="py-1 pr-2 font-medium">Mensal</th>
                <th className="py-1">
                  <span className="sr-only">Apagar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <Input aria-label={`Nome do extra ${i + 1}`} maxLength={80} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <Input aria-label={`Preço do extra ${i + 1}`} inputMode="decimal" className="w-24" value={r.price} onChange={(e) => edit(i, { price: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <Select aria-label={`Tipo do extra ${i + 1}`} value={r.kind} onChange={(e) => edit(i, { kind: e.target.value as QuoteExtra['kind'] })}>
                      <option value="fixed">€ por unidade</option>
                      <option value="percent">% sobre o total</option>
                    </Select>
                  </td>
                  <td className="py-1 pr-2">
                    <Input aria-label={`Unidade do extra ${i + 1}`} maxLength={20} className="w-24" placeholder="página" value={r.unit} onChange={(e) => edit(i, { unit: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <Input aria-label={`Horas do extra ${i + 1}`} inputMode="decimal" className="w-20" value={r.hours} onChange={(e) => edit(i, { hours: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label={`Mensal: extra ${i + 1}`}
                      disabled={r.kind === 'percent'}
                      checked={r.kind === 'fixed' && r.recurring}
                      onChange={(e) => edit(i, { recurring: e.target.checked })}
                    />
                  </td>
                  <td className="py-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRows(list.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Apagar extra {r.name || i + 1}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.length >= 40}
            onClick={() => setRows([...list, { name: '', price: '0', kind: 'fixed', unit: '', hours: '0', recurring: false }])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Juntar extra
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setRows(DEFAULT_QUOTE_EXTRAS.map(toDraftExtra))}>
              Repor os de origem
            </Button>
            <Button type="submit" loading={saving} disabled={!dirty}>
              Guardar calculadora
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

const POMODORO_FIELDS = [
  { key: 'work_minutes', label: 'Trabalho (min)' },
  { key: 'short_break_minutes', label: 'Pausa (min)' },
  { key: 'long_break_minutes', label: 'Pausa longa (min)' },
  { key: 'long_every', label: 'Pausa longa a cada' },
] as const;
type PomodoroNumbers = Record<(typeof POMODORO_FIELDS)[number]['key'], string>;

export function PomodoroSettingsCard({ settings }: { settings: SettingsWithMail }) {
  const patch = usePatchSettings();
  const current = settings.pomodoro;
  const [form, setForm] = useState<PomodoroNumbers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const values: PomodoroNumbers = form ?? {
    work_minutes: String(current.work_minutes),
    short_break_minutes: String(current.short_break_minutes),
    long_break_minutes: String(current.long_break_minutes),
    long_every: String(current.long_every),
  };

  async function save(next: Partial<typeof current>, message: string) {
    setSaving(true);
    setError(null);
    try {
      await patch({ pomodoro: { ...current, ...next } });
      setForm(null);
      toast.success(message);
    } catch (err) {
      const msg = firstError(err);
      if (msg) setError(msg);
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const numbers = Object.fromEntries(POMODORO_FIELDS.map(({ key }) => [key, Math.round(Number(values[key].replace(',', '.')))]));
    void save(numbers, 'Tempos do Pomodoro guardados (valem a partir do próximo pomodoro).');
  }

  return (
    <Card>
      <CardHeader title="Pomodoro" description="Os tempos de cada fase. O trabalho fica no registo de horas do projeto; as pausas não." />
      <form onSubmit={submit} className="flex flex-col gap-3 p-4" noValidate>
        <div className="flex flex-wrap gap-3">
          {POMODORO_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} className="w-36">
              <Input inputMode="numeric" value={values[key]} onChange={(e) => setForm({ ...values, [key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={current.sound}
              onChange={(e) => void save({ sound: e.target.checked }, e.target.checked ? 'Som ligado.' : 'Som desligado.')}
            />
            Tocar um som no fim de cada fase
          </label>
          <Select
            aria-label="Som do aviso"
            value={current.sound_name}
            disabled={!current.sound}
            className="h-9 w-44 text-sm"
            onChange={(e) => {
              const sound = e.target.value as PomodoroSound;
              unlockSound();
              playChime(sound);
              void save({ sound_name: sound }, `Som: ${POMODORO_SOUND_LABELS[sound]}.`);
            }}
          >
            {POMODORO_SOUNDS.map((s) => (
              <option key={s} value={s}>
                {POMODORO_SOUND_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" variant="ghost" disabled={!current.sound} onClick={() => (unlockSound(), playChime(current.sound_name))}>
            <Volume2 className="h-3.5 w-3.5" aria-hidden /> Testar som
          </Button>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={current.auto_start_break}
            onChange={(e) =>
              void save(
                { auto_start_break: e.target.checked },
                e.target.checked ? 'A pausa começa sozinha no fim de cada pomodoro.' : 'A pausa fica à espera: carrega em "Começar pausa" quando quiseres.',
              )
            }
          />
          Começar a pausa automaticamente
          <span className="text-muted">(desligado: fica à espera de “Começar pausa”)</span>
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setForm({
                work_minutes: String(DEFAULT_POMODORO_SETTINGS.work_minutes),
                short_break_minutes: String(DEFAULT_POMODORO_SETTINGS.short_break_minutes),
                long_break_minutes: String(DEFAULT_POMODORO_SETTINGS.long_break_minutes),
                long_every: String(DEFAULT_POMODORO_SETTINGS.long_every),
              })
            }
          >
            Repor 25 / 5 / 15
          </Button>
          <Button type="submit" loading={saving} disabled={form === null}>
            Guardar tempos
          </Button>
        </div>
      </form>
    </Card>
  );
}
