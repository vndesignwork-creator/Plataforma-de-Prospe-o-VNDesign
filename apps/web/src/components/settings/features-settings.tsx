'use client';

/**
 * Definições → Funcionalidades: ligar/desligar o relatório de diagnóstico, os
 * pagamentos, as reuniões, a página Projetos (e as partes dela), as mensagens
 * prontas do WhatsApp, o link de avaliação no Google e a cópia de segurança.
 */
import { useQueryClient } from '@tanstack/react-query';
import { WEEKDAY_LABELS, formatDateTime, type Features } from '@vndesign/core';
import { BadgeCheck, BriefcaseBusiness, CalendarPlus, ClipboardList, Clock, FileSignature, Receipt, Zap, DatabaseBackup, FileText, FolderOpen, Link2, MessageCircle, RefreshCcw, Star, Wallet, type LucideIcon } from 'lucide-react';
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
import { BriefingQuestionsCard, CalendarFeedCard, ContractSettingsCard, KickoffCard } from './project-settings-cards';

const FEATURES: { key: keyof Features; label: string; description: string; icon: LucideIcon; sub?: boolean }[] = [
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
    description: 'Clientes com o projeto em curso: prazo de entrega, fases, tarefas, pagamentos, calendário e resumo diário.',
    icon: BriefcaseBusiness,
  },
  {
    key: 'project_kickoff',
    label: 'Arranque automático do projeto',
    description: 'Ao passar a Cliente: prazo, revisões, tarefas e plano de pagamentos (detalhes abaixo).',
    icon: Zap,
    sub: true,
  },
  {
    key: 'briefing',
    label: 'Briefing online',
    description: 'Um formulário para o cliente (objetivos, cores, conteúdos, ficheiros). Perguntas abaixo.',
    icon: ClipboardList,
    sub: true,
  },
  {
    key: 'revisions',
    label: 'Rondas de revisão',
    description: 'Quantas revisões estão incluídas e as que o cliente pediu; avisa quando passa das incluídas.',
    icon: RefreshCcw,
    sub: true,
  },
  {
    key: 'time_tracking',
    label: 'Registo de horas',
    description: 'Temporizador ▶/⏸ em cada projeto e quanto ganhas por hora.',
    icon: Clock,
    sub: true,
  },
  {
    key: 'expenses',
    label: 'Despesas e lucro',
    description: 'Custos de cada projeto, lucro real e ganho líquido por hora.',
    icon: Receipt,
    sub: true,
  },
  {
    key: 'deliverables',
    label: 'Ficheiros e entregas',
    description: 'Links do Drive, Figma ou Canva, com “Enviada” e “Aprovada pelo cliente”.',
    icon: FolderOpen,
    sub: true,
  },
  {
    key: 'client_page',
    label: 'Página para o cliente',
    description: 'Um link só de leitura para o cliente acompanhar o projeto (sem login).',
    icon: Link2,
    sub: true,
  },
  {
    key: 'client_approvals',
    label: 'Aprovação pelo cliente',
    description: 'Na página do cliente: “Aprovar” ou “Pedir alterações” em cada entrega enviada (cria uma revisão).',
    icon: BadgeCheck,
    sub: true,
  },
  {
    key: 'contracts',
    label: 'Contratos',
    description: 'Contrato em PDF gerado a partir da proposta, aceite online pelo cliente.',
    icon: FileSignature,
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
        <ul className="divide-y divide-border" aria-label="Funcionalidades">
          {FEATURES.map(({ key, label, description, icon: Icon, sub }) => (
            <li key={key} className={cn('flex items-start gap-3 px-4 py-3', sub && 'pl-10', sub && !settings.features.projects && 'opacity-60')}>
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

      {settings.features.projects && settings.features.project_kickoff ? <KickoffCard settings={settings} /> : null}
      {settings.features.projects && settings.features.briefing ? <BriefingQuestionsCard settings={settings} /> : null}
      {settings.features.contracts ? <ContractSettingsCard settings={settings} /> : null}
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
