'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCustomFields } from '@/components/leads/custom-fields';
import { useLeadTags } from '@/components/leads/tags';
import { Badge, Card } from '@/components/ui/card';
import {
  useApiTokens,
  useDoNotContact,
  useMailAccount,
  useMe,
  usePackages,
  useSectors,
  useServices,
  useSettings,
  useSignature,
  useTaskTemplates,
} from '@/lib/queries';
import { SETTINGS_GROUPS, useSettingsSections, type SettingsSection } from './settings-nav';

type Tone = 'neutral' | 'success' | 'warning';
type Status = { text: string; tone?: Tone } | null;

const count = (n: number | undefined, one: string, many: string): Status =>
  n === undefined ? null : { text: n === 0 ? `Sem ${many}` : `${n} ${n === 1 ? one : many}`, tone: n === 0 ? 'warning' : 'neutral' };

/* Um componente por secção: só pede à API o que a secção mostra (o prospetor só vê as dele). */
function SignatureStatus() {
  const { data } = useSignature();
  if (!data) return null;
  const missing = [
    !data.phone && 'telefone',
    !data.email && 'email',
    !data.website && 'site',
    !data.portfolio_url && 'portfólio',
  ].filter(Boolean) as string[];
  return <StatusBadge status={missing.length ? { text: `Falta: ${missing.join(', ')}`, tone: 'warning' } : { text: 'Completa', tone: 'success' }} />;
}

function AccountStatus() {
  const { data } = useMe();
  return <StatusBadge status={data?.user.email ? { text: data.user.email } : null} />;
}

function MailStatus() {
  const { data, isLoading } = useMailAccount();
  if (isLoading) return null;
  return <StatusBadge status={data ? { text: `Ligado · ${data.from_email}`, tone: 'success' } : { text: 'Por ligar', tone: 'warning' }} />;
}

function RemindersStatus() {
  const { data } = useSettings();
  if (!data) return null;
  const digest = data.daily_digest.enabled ? 'resumo diário ligado' : 'sem resumo diário';
  return <StatusBadge status={{ text: `Follow-up a ${data.follow_up_days} dias · ${digest}` }} />;
}

function FeaturesStatus() {
  const { data } = useSettings();
  if (!data) return null;
  const values = Object.values(data.features);
  return <StatusBadge status={{ text: `${values.filter(Boolean).length} de ${values.length} ligadas` }} />;
}

function AiStatus() {
  const { data } = useSettings();
  if (!data) return null;
  return <StatusBadge status={data.ai_configured ? { text: 'Ligada', tone: 'success' } : { text: 'Por configurar', tone: 'warning' }} />;
}

function SiteFormStatus() {
  const { data } = useSettings();
  if (!data) return null;
  return <StatusBadge status={data.site_form.token ? { text: 'Ligado', tone: 'success' } : { text: 'Desligado' }} />;
}

function ServicesStatus() {
  const { data } = useServices();
  return <StatusBadge status={count(data?.length, 'serviço', 'serviços')} />;
}

function PackagesStatus() {
  const { data } = usePackages();
  return <StatusBadge status={count(data?.length, 'pacote', 'pacotes')} />;
}

function DncStatus() {
  const { data } = useDoNotContact();
  return <StatusBadge status={data ? { text: data.length ? `${data.length} na lista` : 'Lista vazia' } : null} />;
}

function SectorsStatus() {
  const { data } = useSectors();
  return <StatusBadge status={count(data?.length, 'setor', 'setores')} />;
}

function TagsStatus() {
  const { data } = useLeadTags();
  return <StatusBadge status={data ? { text: data.length ? `${data.length} ${data.length === 1 ? 'etiqueta' : 'etiquetas'}` : 'Nenhuma ainda' } : null} />;
}

function CustomFieldsStatus() {
  const { data } = useCustomFields();
  return <StatusBadge status={data ? { text: data.length ? `${data.length} ${data.length === 1 ? 'campo' : 'campos'}` : 'Nenhum ainda' } : null} />;
}

function TaskTemplatesStatus() {
  const { data } = useTaskTemplates();
  return <StatusBadge status={count(data?.length, 'lista', 'listas')} />;
}

function ApiStatus() {
  const { data } = useApiTokens();
  const active = data?.filter((t) => !t.revoked_at).length;
  return <StatusBadge status={active === undefined ? null : { text: active ? `${active} ${active === 1 ? 'chave ativa' : 'chaves ativas'}` : 'Sem chaves' }} />;
}

const STATUS: Record<SettingsSection['slug'], () => ReactNode> = {
  assinatura: SignatureStatus,
  conta: AccountStatus,
  email: MailStatus,
  lembretes: RemindersStatus,
  'nao-contactar': DncStatus,
  servicos: ServicesStatus,
  propostas: PackagesStatus,
  formulario: SiteFormStatus,
  setores: SectorsStatus,
  etiquetas: TagsStatus,
  campos: CustomFieldsStatus,
  'listas-tarefas': TaskTemplatesStatus,
  funcionalidades: FeaturesStatus,
  ia: AiStatus,
  api: ApiStatus,
};

function StatusBadge({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <Badge tone={status.tone ?? 'neutral'} className="max-w-full truncate">
      {status.text}
    </Badge>
  );
}

/** Página inicial das Definições: cada secção com uma frase e o estado (o que falta configurar salta à vista). */
export function SettingsOverview() {
  const sections = useSettingsSections();
  return (
    <div className="flex flex-col gap-6">
      {SETTINGS_GROUPS.map((group) => {
        const items = sections.filter((s) => s.group === group.id);
        if (!items.length) return null;
        return (
          <section key={group.id} aria-labelledby={`grupo-${group.id}`}>
            <h2 id={`grupo-${group.id}`} className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
              {group.label}
            </h2>
            <Card className="divide-y divide-border overflow-hidden lg:grid lg:grid-cols-2 lg:divide-y-0 lg:gap-px lg:bg-border">
              {items.map((s) => {
                const Icon = s.icon;
                const Status = STATUS[s.slug];
                return (
                  <Link
                    key={s.slug}
                    href={`/definicoes/${s.slug}`}
                    className="group flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted group-hover:text-accent-text">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="text-xs text-muted">{s.description}</span>
                      <span className="flex min-w-0">
                        <Status />
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                );
              })}
              {/* Número ímpar no computador: a última célula não fica com o fundo da grelha. */}
              {items.length % 2 ? <div aria-hidden className="hidden bg-surface lg:block" /> : null}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
