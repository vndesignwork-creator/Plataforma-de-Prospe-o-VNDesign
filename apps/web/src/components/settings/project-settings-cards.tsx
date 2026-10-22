'use client';

/**
 * Definições → Funcionalidades (continuação): arranque automático do projeto,
 * perguntas do briefing, contratos (NIF e condições gerais) e o calendário
 * para subscrever no telemóvel.
 */
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_BRIEFING_QUESTIONS, DEFAULT_CONTRACT_CLAUSES, KICKOFF_SPLITS } from '@vndesign/core';
import { CalendarDays, Copy, Link2Off, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
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
