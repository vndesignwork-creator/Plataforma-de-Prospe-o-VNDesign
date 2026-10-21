'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_FOLLOW_UP_SEQUENCE, FOLLOW_UP_SEQUENCE_MAX_STEPS } from '@vndesign/core';
import { Archive, Mail, Plus, Reply, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useMe, useSettings, useTemplates, type SettingsWithMail } from '@/lib/queries';
import { PushSettings } from './push-settings';

export function PreferencesSettings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: settings, isLoading } = useSettings();
  const [followUpDays, setFollowUpDays] = useState('3');
  const { data: templates } = useTemplates();
  const followUpTemplates = (templates ?? []).filter((t) => t.kind === 'follow_up');
  const [sequenceEnabled, setSequenceEnabled] = useState(true);
  const [steps, setSteps] = useState<{ days: string; template_id: string }[]>(
    DEFAULT_FOLLOW_UP_SEQUENCE.steps.map((s) => ({ days: String(s.days), template_id: '' })),
  );
  const [optOut, setOptOut] = useState('');
  const [autoArchive, setAutoArchive] = useState(false);
  const [autoArchiveDays, setAutoArchiveDays] = useState('60');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settings) return;
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza o formulário com os dados carregados */
    setFollowUpDays(String(settings.follow_up_days));
    setSequenceEnabled(settings.follow_up_sequence.enabled);
    setSteps(settings.follow_up_sequence.steps.map((s) => ({ days: String(s.days), template_id: s.template_id ?? '' })));
    setOptOut(settings.opt_out_line);
    setAutoArchive(settings.auto_archive_days !== null);
    setAutoArchiveDays(String(settings.auto_archive_days ?? 60));
    setDigestEnabled(settings.daily_digest.enabled);
    setRecipient(settings.daily_digest.recipient ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api<{ data: SettingsWithMail }>('/settings', {
        method: 'PATCH',
        body: {
          follow_up_days: Number(followUpDays),
          follow_up_sequence: {
            enabled: sequenceEnabled,
            steps: steps.map((s) => ({ days: Number(s.days), template_id: s.template_id || null })),
          },
          auto_archive_days: autoArchive ? Number(autoArchiveDays) : null,
          opt_out_line: optOut,
          daily_digest: { enabled: digestEnabled, recipient },
        },
      });
      qc.setQueryData(['settings'], data);
      toast.success('Definições guardadas.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const { data } = await api<{ data: { sent_to: string } }>('/settings/test-digest', { method: 'POST' });
      toast.success(`Resumo de teste enviado para ${data.sent_to}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  if (isLoading || !settings) return <Skeleton className="h-64" />;

  return (
    <Card id="lembretes">
      <CardHeader title="Follow-up e lembretes" />
      <form onSubmit={save} className="grid gap-5 p-4 md:grid-cols-2" noValidate>
        <Field label="Dias até ao follow-up" hint='Ao passar um lead a "Contactado" à mão (ou com a sequência desligada), a próxima ação fica para daqui a N dias.'>
          <Input type="number" min={1} max={60} value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} />
        </Field>
        <Field label="Linha de opt-out (RGPD)" hint="Variável {{opt_out}} nos modelos de email.">
          <Input value={optOut} onChange={(e) => setOptOut(e.target.value)} />
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 md:col-span-2">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
            <Reply className="h-4 w-4" aria-hidden /> Sequência de follow-ups por email
          </legend>
          <p className="text-sm text-muted">
            Depois de um email enviado pela plataforma, a próxima ação passa a ser o follow-up seguinte (N dias depois do email
            anterior), já escrito: no dia certo
            aparece em “Hoje” com o botão <strong>Enviar follow-up</strong>, para rever e enviar com um clique (na mesma conversa).
            Para quando o lead responde.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sequenceEnabled} onChange={(e) => setSequenceEnabled(e.target.checked)} />
            Usar a sequência de follow-ups
          </label>
          {sequenceEnabled ? (
            <ol className="flex flex-col gap-3" aria-label="Passos da sequência">
              {steps.map((step, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[11rem_1fr_auto]">
                  <Field label={`${i + 1}.º follow-up (dias)`}>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={step.days}
                      onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, days: e.target.value } : s)))}
                    />
                  </Field>
                  <Field label="Modelo" className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                    <Select
                      value={step.template_id}
                      onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, template_id: e.target.value } : s)))}
                    >
                      <option value="">Automático (o mais adequado ao lead)</option>
                      {followUpTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={steps.length <= 1}
                    onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                    aria-label={`Tirar o ${i + 1}.º follow-up`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
              {steps.length < FOLLOW_UP_SEQUENCE_MAX_STEPS ? (
                <li>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSteps([...steps, { days: String(Math.min(60, Number(steps.at(-1)?.days ?? 7) * 2)), template_id: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Acrescentar follow-up
                  </Button>
                </li>
              ) : null}
            </ol>
          ) : null}
          <p className="text-xs text-muted">
            Depois do último, a próxima ação fica “Sem resposta aos follow-ups: ligar ou marcar Sem interesse”. Os modelos editam-se
            em Scripts.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 md:col-span-2">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
            <Archive className="h-4 w-4" aria-hidden /> Arquivo automático
          </legend>
          <p className="text-sm text-muted">
            Os leads em &quot;Sem interesse&quot; há muito tempo passam sozinhos para o arquivo (todas as manhãs). Continuam na
            deteção de duplicados e nas estatísticas, e podes repô-los quando quiseres (Leads → filtro &quot;Só os
            arquivados&quot;).
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoArchive} onChange={(e) => setAutoArchive(e.target.checked)} />
            Arquivar automaticamente os leads sem interesse
          </label>
          {autoArchive ? (
            <Field label="Depois de quantos dias em “Sem interesse”" hint="Entre 7 e 365 dias.">
              <Input
                type="number"
                min={7}
                max={365}
                value={autoArchiveDays}
                onChange={(e) => setAutoArchiveDays(e.target.value)}
                className="max-w-32"
              />
            </Field>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 md:col-span-2">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
            <Mail className="h-4 w-4" aria-hidden /> Resumo diário por email
          </legend>
          <p className="text-sm text-muted">
            Todas as manhãs, um email com os follow-ups em atraso, de hoje e dos próximos 7 dias (só é enviado quando há algo
            para hoje).{' '}
            {settings.mail_configured ? (
              <Badge tone="success">Email configurado</Badge>
            ) : (
              <Badge tone="warning">Falta configurar o SMTP no servidor (ver README)</Badge>
            )}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(e) => setDigestEnabled(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Enviar o resumo diário
          </label>
          <Field label="Enviar para" hint={`Vazio = ${me?.user.email ?? 'o teu email'}`}>
            <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={me?.user.email ?? ''} />
          </Field>
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={sendTest} loading={testing} disabled={!settings.mail_configured}>
              Enviar um resumo de teste agora
            </Button>
          </div>
        </fieldset>

        <div className="md:col-span-2">
          <PushSettings />
        </div>

        <div className="flex justify-end md:col-span-2">
          <Button type="submit" loading={saving}>
            Guardar definições
          </Button>
        </div>
      </form>
    </Card>
  );
}
