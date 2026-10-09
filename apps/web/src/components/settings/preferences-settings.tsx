'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useMe, useSettings, type SettingsWithMail } from '@/lib/queries';
import { PushSettings } from './push-settings';

export function PreferencesSettings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: settings, isLoading } = useSettings();
  const [followUpDays, setFollowUpDays] = useState('3');
  const [optOut, setOptOut] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settings) return;
    /* eslint-disable react-hooks/set-state-in-effect -- sincroniza o formulário com os dados carregados */
    setFollowUpDays(String(settings.follow_up_days));
    setOptOut(settings.opt_out_line);
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
        <Field label="Dias até ao follow-up" hint='Ao passar um lead a "Contactado", a próxima ação fica para daqui a N dias.'>
          <Input type="number" min={1} max={60} value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} />
        </Field>
        <Field label="Linha de opt-out (RGPD)" hint="Variável {{opt_out}} nos modelos de email.">
          <Input value={optOut} onChange={(e) => setOptOut(e.target.value)} />
        </Field>

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
          <div>
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
