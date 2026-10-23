'use client';

/**
 * Equipa → Prospeção: quem tem conta na plataforma (prospetor: só a parte
 * comercial; administrador: tudo), mudar o papel, remover, convites por
 * aceitar e o limite semanal do gerador de leads para os prospetores.
 * O convite em si está em components/team/team-view.tsx.
 */
import { useQueryClient } from '@tanstack/react-query';
import { MEMBER_ROLE_LABELS, formatDate, type InviteRole } from '@vndesign/core';
import { Check, Copy, Mail, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';
import { useSettings, useTeam, useTeamAction, type SettingsWithMail } from '@/lib/queries';

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
  const action = useTeamAction();
  const [confirm, setConfirm] = useState<string | null>(null);

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
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.name ?? m.email} {m.is_me ? <span className="font-normal text-muted">(tu)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {m.email} · desde {formatDate(m.joined_at.slice(0, 10))}
                  </span>
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

export function ProspectorAccessCard() {
  return (
      <Card>
        <CardHeader title="O que um prospetor vê" />
        <ul className="grid gap-1.5 p-4 text-sm sm:grid-cols-2">
          {[
            [true, 'Leads (os que cria ficam dele), Kanban e Mapa'],
            [true, 'Prospeção: só os leads de que é responsável'],
            [true, 'Gerar leads com IA (com limite semanal)'],
            [true, 'Scripts, WhatsApp, chamadas e emails pela tua conta, com a assinatura dele'],
            [false, 'Valores, propostas, pagamentos e contratos'],
            [false, 'Projetos, horas, colaboradores e kit da marca'],
            [false, 'Estatísticas financeiras e Definições (só a assinatura e a conta)'],
            [false, 'Apagar leads ou mudar o responsável'],
          ].map(([ok, text]) => (
            <li key={text as string} className="flex items-start gap-2">
              {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
              <span>{text as string}</span>
            </li>
          ))}
        </ul>
      </Card>
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
      <CardHeader title="Gerador de leads da equipa" description="A pesquisa com IA é paga pela tua conta: limita quantos leads cada prospetor pode juntar por semana (0 = sem gerador)." />
      <form onSubmit={save} className="flex flex-wrap items-end gap-3 p-4" noValidate>
        <Field label="Leads por semana, por prospetor" className="w-56">
          <Input inputMode="numeric" value={value ?? current} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button type="submit" loading={saving} disabled={value === null}>
          Guardar limite
        </Button>
      </form>
    </Card>
  );
}
