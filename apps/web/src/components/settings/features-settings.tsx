'use client';

/**
 * Definições → Funcionalidades: ligar/desligar o relatório de diagnóstico, os
 * pagamentos, as reuniões, a página Projetos e as mensagens prontas do WhatsApp,
 * e a cópia de segurança semanal.
 */
import { useQueryClient } from '@tanstack/react-query';
import { WEEKDAY_LABELS, formatDateTime, type Features } from '@vndesign/core';
import { BriefcaseBusiness, CalendarPlus, DatabaseBackup, FileText, MessageCircle, Wallet, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useMe, useSettings, type SettingsWithMail } from '@/lib/queries';

const FEATURES: { key: keyof Features; label: string; description: string; icon: LucideIcon }[] = [
  {
    key: 'diagnosis_report',
    label: 'Relatório de diagnóstico em PDF',
    description: 'Na ficha (Diagnóstico do site): o PDF com a tua marca, para ver ou enviar ao cliente em anexo.',
    icon: FileText,
  },
  {
    key: 'meetings',
    label: 'Reuniões',
    description: 'Marcar reuniões na ficha, com convite de calendário para o cliente e lembrete 1 hora antes.',
    icon: CalendarPlus,
  },
  {
    key: 'payments',
    label: 'Pagamentos e faturação',
    description: 'Plano de pagamentos de cada cliente (sinal, prestações) e a faturação no Dashboard.',
    icon: Wallet,
  },
  {
    key: 'projects',
    label: 'Projetos',
    description: 'Página com os clientes com o projeto em curso: tarefas, pagamentos e próxima reunião.',
    icon: BriefcaseBusiness,
  },
  {
    key: 'whatsapp_templates',
    label: 'Mensagens prontas no WhatsApp',
    description: 'O botão WhatsApp da ficha abre um menu com mensagens já escritas (primeiro contacto, follow-up, lembrete de reunião). Editam-se em Scripts.',
    icon: MessageCircle,
  },
];

export function FeaturesSettings() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: me } = useMe();
  const [backup, setBackup] = useState({ enabled: true, recipient: '', weekday: '1' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

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
        <ul className="divide-y divide-border" aria-label="Funcionalidades">
          {FEATURES.map(({ key, label, description, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 px-4 py-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-sm text-muted">{description}</span>
              </span>
              <Switch checked={settings.features[key]} onCheckedChange={(on) => void toggle(key, on)} label={`${label}: ${settings.features[key] ? 'desligar' : 'ligar'}`} />
            </li>
          ))}
        </ul>
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
