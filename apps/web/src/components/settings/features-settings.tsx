'use client';

/**
 * Definições → Funcionalidades: ligar/desligar o relatório de diagnóstico, os
 * pagamentos, as reuniões, a página Projetos (e as partes dela), as mensagens
 * prontas do WhatsApp, o link de avaliação no Google e a cópia de segurança.
 */
import { useQueryClient } from '@tanstack/react-query';
import { WEEKDAY_LABELS, formatDateTime, type Features } from '@vndesign/core';
import { DatabaseBackup, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useMe, useSettings, type SettingsWithMail } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { FEATURE_BY_KEY, FEATURE_GROUPS, FEATURE_PARENT } from './features-list';
import { BriefingQuestionsCard, CalendarFeedCard, ContractSettingsCard, HourlyRateCard, KickoffCard, PomodoroSettingsCard, QuoteSettingsCard } from './project-settings-cards';

export function FeaturesSettings() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: me } = useMe();
  const [backup, setBackup] = useState({ enabled: true, recipient: '', weekday: '1' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    if (!settings) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o formulário com os dados carregados */
    setBackup({
      enabled: settings.weekly_backup.enabled,
      recipient: settings.weekly_backup.recipient ?? '',
      weekday: String(settings.weekly_backup.weekday),
    });
  }, [settings]);

  async function patch(body: Record<string, unknown>) {
    const { data } = await api<{ data: SettingsWithMail }>('/settings', { method: 'PATCH', body });
    qc.setQueryData(['settings'], data);
    return data;
  }

  async function toggle(key: keyof Features, on: boolean) {
    try {
      await patch({ features: { [key]: on } });
      toast.success(on ? 'Funcionalidade ligada.' : 'Funcionalidade desligada (os dados ficam guardados).');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function saveBackup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await patch({ weekly_backup: { enabled: backup.enabled, recipient: backup.recipient, weekday: Number(backup.weekday) } });
      toast.success('Cópia de segurança guardada.');
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveReview(e: React.FormEvent) {
    e.preventDefault();
    setSavingReview(true);
    setReviewError(null);
    try {
      await patch({ google_review_url: review ?? '' });
      setReview(null);
      toast.success('Link de avaliação guardado.');
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setReviewError((error.problem.errors as Record<string, string[]>).google_review_url?.[0] ?? 'Link inválido.');
      else toast.error(errorMessage(error));
    } finally {
      setSavingReview(false);
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const { data } = await api<{ data: { sent_to: string; leads: number } }>('/settings/backup', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Cópia enviada para ${data.sent_to} (${data.leads} leads).`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-64" />;
  const last = settings.weekly_backup.last_sent_at;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Funcionalidades" description="Desliga o que não usas: sai do menu e da ficha. Os dados ficam guardados." />
        <div className="flex flex-col gap-5 p-4" aria-label="Funcionalidades" role="group">
          {FEATURE_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`func-${group.title}`} className="overflow-hidden rounded-xl border border-border">
              <header className="flex items-start gap-3 border-b border-border bg-surface-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <h3 id={`func-${group.title}`} className="text-sm font-semibold">
                    {group.title}
                  </h3>
                  <p className="text-xs text-muted">{group.description}</p>
                </span>
              </header>
              {group.parts.map((part) => (
                <div key={part.title ?? 'main'}>
                  {part.title ? (
                    <p className="border-b border-border px-4 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{part.title}</p>
                  ) : null}
                  <ul className="divide-y divide-border border-b border-border last:border-b-0">
                    {part.keys.map((key) => {
                      const f = FEATURE_BY_KEY.get(key)!;
                      const Icon = f.icon;
                      // Depende de outra (ex.: o Pomodoro precisa do registo de horas): fica mais à direita e esbatida se essa estiver desligada.
                      const parent = FEATURE_PARENT[key];
                      const off = (group.master && key !== group.master && !settings.features[group.master]) || (parent && !settings.features[parent]);
                      return (
                        <li key={key} className={cn('flex items-start gap-3 px-4 py-3', parent && 'pl-10', off && 'opacity-60')}>
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium" data-setting-label>
                              {f.label}
                            </span>
                            <span className="block text-sm text-muted">{f.description}</span>
                          </span>
                          <Switch
                            checked={settings.features[key]}
                            onCheckedChange={(on) => void toggle(key, on)}
                            label={`${f.label}: ${settings.features[key] ? 'desligar' : 'ligar'}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Card>

      {settings.features.projects && settings.features.project_kickoff ? <KickoffCard settings={settings} /> : null}
      {settings.features.projects && settings.features.briefing ? <BriefingQuestionsCard settings={settings} /> : null}
      {settings.features.contracts ? <ContractSettingsCard settings={settings} /> : null}
      {settings.features.projects && settings.features.time_tracking && settings.features.time_value ? <HourlyRateCard settings={settings} /> : null}
      {settings.features.quote_calculator ? <QuoteSettingsCard settings={settings} /> : null}
      {settings.features.projects && settings.features.time_tracking && settings.features.pomodoro ? <PomodoroSettingsCard settings={settings} /> : null}
      <CalendarFeedCard />

      <Card>
        <CardHeader
          title="Avaliações no Google"
          description="O link da tua ficha no Google para os clientes deixarem uma avaliação. Usa-se em {{avaliacao}} e ao concluir um projeto."
        />
        <form onSubmit={saveReview} className="flex flex-wrap items-end gap-3 p-4" noValidate>
          <Field
            label="Link para avaliação"
            error={reviewError ?? undefined}
            hint="No Perfil da Empresa no Google: “Pedir avaliações” → copiar o link."
            className="min-w-0 flex-[1_1_18rem]"
          >
            <Input
              inputMode="url"
              placeholder="https://g.page/r/…/review"
              value={review ?? settings.google_review_url ?? ''}
              onChange={(e) => setReview(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={savingReview} disabled={review === null}>
            <Star className="h-4 w-4" aria-hidden /> Guardar link
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Cópia de segurança semanal"
          description="Todos os leads (também os arquivados) num ficheiro Excel, por email. Pode ser reimportado em Leads → Importar / Exportar."
          actions={
            <Switch
              checked={backup.enabled}
              onCheckedChange={(on) => setBackup({ ...backup, enabled: on })}
              label={backup.enabled ? 'Desligar a cópia de segurança semanal' : 'Ligar a cópia de segurança semanal'}
            />
          }
        />
        <form onSubmit={saveBackup} className="grid gap-4 p-4 md:grid-cols-2" noValidate>
          <Field label="Enviar para" error={errors['weekly_backup.recipient']?.[0] ?? errors.recipient?.[0]} hint={`Vazio = ${me?.user.email ?? 'o teu email'}`}>
            <Input
              type="email"
              inputMode="email"
              value={backup.recipient}
              placeholder={me?.user.email ?? ''}
              onChange={(e) => setBackup({ ...backup, recipient: e.target.value })}
            />
          </Field>
          <Field label="Dia da semana" hint="De manhã, com o resumo diário.">
            <Select value={backup.weekday} onChange={(e) => setBackup({ ...backup, weekday: e.target.value })}>
              {Object.entries(WEEKDAY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="flex items-center gap-2 text-sm text-muted md:col-span-2">
            <DatabaseBackup className="h-4 w-4 shrink-0" aria-hidden />
            {last ? `Última cópia enviada: ${formatDateTime(last)}.` : 'Ainda não foi enviada nenhuma cópia.'}
          </p>
          <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" onClick={sendNow} loading={sending}>
              Enviar uma cópia agora
            </Button>
            <Button type="submit" loading={saving}>
              Guardar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
