'use client';

/**
 * Equipa → Prospeção: quem tem conta na plataforma (prospetor: só a parte
 * comercial; administrador: tudo), mudar o papel, remover, convites por
 * aceitar e o limite semanal do gerador de leads para os prospetores.
 * O convite em si está em components/team/team-view.tsx.
 */
import { useQueryClient } from '@tanstack/react-query';
import { MEMBER_ROLE_LABELS, formatDate, type InviteRole, type TeamStats } from '@vndesign/core';
import { Check, ChevronRight, Copy, Mail, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useSettings, useTeam, useTeamAction, useTeamStats, type SettingsWithMail } from '@/lib/queries';

export const teamInviteUrl = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/equipa/${token}`;

async function copyLink(token: string) {
  try {
    await navigator.clipboard.writeText(teamInviteUrl(token));
    toast.success('Link do convite copiado.');
  } catch {
    toast.error('Não foi possível copiar o link.');
  }
}

export function TeamMembers() {
  const { data: team, isLoading } = useTeam();
  const { data: stats } = useTeamStats();
  const byUser = new Map((stats?.members ?? []).map((m) => [m.user_id, m]));
  const action = useTeamAction();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  // Reenviar = novo convite por email (o link antigo é anulado).
  async function resend(i: { id: string; email: string; name: string | null; role: InviteRole }) {
    setResending(i.id);
    try {
      await action.mutateAsync({ revoke: i.id });
      const result = await action.mutateAsync({ invite: { email: i.email, name: i.name ?? undefined, role: i.role, send_email: true } });
      if (result && 'emailed' in result && result.emailed) toast.success(`Convite reenviado para ${i.email}.`);
      else if (result && 'invite' in result) {
        await copyLink(result.invite.token);
        toast.info('Não foi possível enviar o email: o link novo foi copiado.');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setResending(null);
    }
  }

  async function run(input: Parameters<typeof action.mutateAsync>[0], success: string) {
    try {
      await action.mutateAsync(input);
      setConfirm(null);
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
      <Card>
        <CardHeader
          title="Equipa de prospeção"
          description="Quem te ajuda a procurar, gerar, organizar e contactar leads. Cada pessoa entra com a sua conta."
        />
        {isLoading || !team ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border" aria-label="Membros da equipa">
            {team.members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                <Avatar name={m.name ?? m.email ?? '?'} url={m.avatar_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.name ?? m.email} {m.is_me ? <span className="font-normal text-muted">(tu)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {m.email} · desde {formatDate(m.joined_at.slice(0, 10))}
                  </span>
                  <MemberNumbers stat={byUser.get(m.user_id)} days={stats?.days ?? 30} />
                </span>
                {m.role === 'owner' || m.is_me ? (
                  <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{MEMBER_ROLE_LABELS[m.role]}</Badge>
                ) : (
                  <Select
                    aria-label={`Papel de ${m.name ?? m.email}`}
                    value={m.role === 'admin' ? 'admin' : 'prospector'}
                    className="h-9 w-40 text-sm"
                    onChange={(e) =>
                      void run({ role: { user_id: m.user_id, role: e.target.value as InviteRole } }, `${m.name ?? m.email}: ${MEMBER_ROLE_LABELS[e.target.value as InviteRole]}.`)
                    }
                  >
                    <option value="prospector">Prospetor</option>
                    <option value="admin">Administrador</option>
                  </Select>
                )}
                {m.role !== 'owner' && !m.is_me ? (
                  confirm === m.user_id ? (
                    <span className="inline-flex items-center gap-1 text-xs">
                      Remover da equipa?
                      <Button size="sm" variant="danger" loading={action.isPending} onClick={() => void run({ remove: m.user_id }, 'Removido da equipa: já não tem acesso.')}>
                        Sim
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                        Não
                      </Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(m.user_id)} aria-label={`Remover ${m.name ?? m.email} da equipa`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  )
                ) : null}
              </li>
            ))}
            {team.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.name ?? i.email}</span>
                  <span className="block truncate text-xs text-muted">
                    {i.email} · convite por aceitar · {MEMBER_ROLE_LABELS[i.role]}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={action.isPending && resending === i.id}
                  onClick={() => void resend(i)}
                  aria-label={`Reenviar o convite a ${i.email}`}
                  title="Reenviar por email (o link anterior deixa de funcionar)"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void copyLink(i.token)} aria-label={`Copiar o link do convite de ${i.email}`}>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void run({ revoke: i.id }, 'Convite anulado.')} aria-label={`Anular o convite de ${i.email}`}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {team && team.members.length < 2 && !team.invites.length ? (
          <p className="border-t border-border px-4 py-3 text-sm text-muted">Ainda só tu. Usa “Convidar” para alguém te ajudar com os leads.</p>
        ) : null}
      </Card>
  );
}

const ACCESS: [boolean, string][] = [
  [true, 'Leads (os que cria ficam dele), Kanban e Mapa'],
  [true, 'Prospeção: só os leads de que é responsável'],
  [true, 'Gerar leads com IA (com limite semanal)'],
  [true, 'Scripts, WhatsApp, chamadas e emails pela tua conta, com a assinatura dele'],
  [false, 'Valores, propostas, pagamentos e contratos'],
  [false, 'Projetos, horas, colaboradores e kit da marca'],
  [false, 'Estatísticas financeiras e Definições (só a assinatura e a conta)'],
  [false, 'Apagar leads ou mudar o responsável'],
];

/** O que o prospetor vê e não vê: recolhido (é texto fixo), abre-se quando é preciso. */
export function ProspectorAccessCard() {
  return (
    <Card>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
          <span className="font-semibold">O que um prospetor vê</span>
          <span className="text-muted">· ver permissões</span>
        </summary>
        <ul className="grid gap-1.5 border-t border-border p-4 text-sm sm:grid-cols-2">
          {ACCESS.map(([ok, text]) => (
            <li key={text} className="flex items-start gap-2">
              {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/** Os números de cada pessoa na linha da equipa (contactos, respostas, gerador). */
function MemberNumbers({ stat, days }: { stat: TeamStats['members'][number] | undefined; days: number }) {
  if (!stat) return null;
  const parts = [
    `${stat.contacts} contacto${stat.contacts === 1 ? '' : 's'} em ${days} dias`,
    stat.contacts_today ? `${stat.contacts_today} hoje` : null,
    `${stat.replied} resposta${stat.replied === 1 ? '' : 's'}`,
    stat.won ? `${stat.won} cliente${stat.won === 1 ? '' : 's'}` : null,
    stat.assigned_open ? `${stat.assigned_open} em aberto` : null,
  ].filter(Boolean);
  const limit = stat.generation_limit;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted">{parts.join(' · ')}</span>
      {limit !== null ? (
        <span
          className={cn('rounded-full px-2 py-0.5 tabular-nums', stat.generation_used >= limit ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-muted')}
          title="Leads juntados pelo gerador nos últimos 7 dias"
        >
          Gerador: {stat.generation_used} de {limit} esta semana
        </span>
      ) : null}
    </span>
  );
}

export function GenerationLimitCard() {
  const { data: settings } = useSettings();
  return settings ? <GenerationLimitForm settings={settings} /> : null;
}

function GenerationLimitForm({ settings }: { settings: SettingsWithMail }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = String(settings.team.generation_weekly_limit);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api<{ data: SettingsWithMail }>('/settings', {
        method: 'PATCH',
        body: { team: { generation_weekly_limit: Math.max(0, Math.round(Number(value ?? current) || 0)) } },
      });
      qc.setQueryData(['settings'], data);
      setValue(null);
      toast.success('Limite guardado.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3" noValidate>
        <div className="min-w-0 flex-[1_1_18rem]">
          <h2 className="text-base font-semibold">Gerador de leads da equipa</h2>
          <p className="text-sm text-muted">A pesquisa com IA é paga pela tua conta. 0 = os prospetores não usam o gerador.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <Input
            inputMode="numeric"
            aria-label="Leads por semana, por prospetor"
            value={value ?? current}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 w-20 text-right tabular-nums"
          />
          <span className="text-muted">leads por semana, por prospetor</span>
        </label>
        {value !== null && value !== current ? (
          <Button type="submit" size="sm" loading={saving}>
            Guardar limite
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
