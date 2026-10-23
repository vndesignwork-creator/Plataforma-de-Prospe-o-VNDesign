'use client';

/**
 * Colaboradores (menu): todas as pessoas convidadas para os projetos, com o
 * estado do convite, as horas que registaram e atalhos para convidar para
 * outro projeto, copiar o link do convite ou remover.
 */
import { formatDateTime, formatMinutes, leadPath, projectLabel, type CollaboratorPerson } from '@vndesign/core';
import { Clock, Copy, FolderKanban, Mail, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useAllCollaborators, useCollaboratorsAdmin, useProjects } from '@/lib/queries';

const inviteUrl = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/convite/${token}`;

async function copyInvite(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success('Link do convite copiado.');
  } catch {
    toast.error('Não foi possível copiar o link.');
  }
}

const initials = (p: CollaboratorPerson) =>
  (p.name ?? p.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function CollaboratorsView() {
  const { data, isLoading } = useAllCollaborators();
  const [inviting, setInviting] = useState<{ name: string; email: string; exclude: string[] } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {data?.length ? `${data.length} pessoa${data.length === 1 ? '' : 's'} · ${data.filter((p) => p.active).length} com conta ativa` : null}
        </p>
        <Button onClick={() => setInviting({ name: '', email: '', exclude: [] })}>
          <UserPlus className="h-4 w-4" aria-hidden /> Convidar
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.length ? (
        <Card>
          <EmptyState title="Ainda sem colaboradores">
            <p className="max-w-md text-sm text-muted">
              Convida um programador, fotógrafo ou copywriter para um projeto: só vê as tarefas, os ficheiros, o briefing e as horas desse projeto.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2" aria-label="Colaboradores">
          {data.map((p) => (
            <li key={p.email} className="min-w-0">
              <PersonCard person={p} onInvite={() => setInviting({ name: p.name ?? '', email: p.email, exclude: p.projects.map((x) => x.lead.id) })} />
            </li>
          ))}
        </ul>
      )}

      {inviting ? <InviteDialog initial={inviting} onClose={() => setInviting(null)} /> : null}
    </div>
  );
}

function PersonCard({ person, onInvite }: { person: CollaboratorPerson; onInvite: () => void }) {
  const admin = useCollaboratorsAdmin();
  const [confirm, setConfirm] = useState<string | null>(null);

  async function remove(id: string) {
    try {
      await admin.mutateAsync({ remove: id });
      setConfirm(null);
      toast.success('Removido do projeto: já não tem acesso.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card className="flex h-full flex-col" aria-label={person.name ?? person.email}>
      <div className="flex items-start gap-3 border-b border-border p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-text" aria-hidden>
          {initials(person)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{person.name ?? person.email}</p>
          <a href={`mailto:${person.email}`} className="inline-flex max-w-full items-center gap-1 truncate text-sm text-muted hover:text-fg hover:underline">
            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{person.email}</span>
          </a>
        </div>
        <Badge tone={person.active ? 'success' : 'neutral'}>{person.active ? 'Ativo' : 'Convite por aceitar'}</Badge>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {formatMinutes(person.minutes_total)} no total · {formatMinutes(person.minutes_30d)} nos últimos 30 dias
        </span>
        {person.last_activity_at ? <span>Última atividade: {formatDateTime(person.last_activity_at)}</span> : null}
      </div>

      <ul className="flex flex-1 flex-col divide-y divide-border px-4 py-2" aria-label={`Projetos de ${person.name ?? person.email}`}>
        {person.projects.map((x) => (
          <li key={x.collaborator_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <FolderKanban className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <Link href={`${leadPath(x.lead)}#projeto`} className="font-medium hover:text-accent-text hover:underline">
                {projectLabel(x.lead)}
              </Link>
              <span className="block text-xs text-muted">
                {x.status === 'ativo' ? `Aceitou${x.accepted_at ? ` a ${formatDateTime(x.accepted_at)}` : ''}` : 'Convite por aceitar'}
                {x.minutes ? ` · ${formatMinutes(x.minutes)}` : ''}
                {x.lead.completed_at ? ' · projeto concluído' : ''}
              </span>
            </span>
            {x.token ? (
              <Button size="sm" variant="ghost" onClick={() => void copyInvite(x.token!)} aria-label={`Copiar o link do convite para ${x.lead.company_name}`}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
            {confirm === x.collaborator_id ? (
              <span className="inline-flex items-center gap-1 text-xs">
                Remover?
                <Button size="sm" variant="danger" loading={admin.isPending} onClick={() => void remove(x.collaborator_id)}>
                  Sim
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                  Não
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(x.collaborator_id)} aria-label={`Remover de ${x.lead.company_name}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-border px-4 py-3">
        <Button size="sm" variant="outline" onClick={onInvite}>
          <UserPlus className="h-3.5 w-3.5" aria-hidden /> Convidar para outro projeto
        </Button>
      </div>
    </Card>
  );
}

function InviteDialog({ initial, onClose }: { initial: { name: string; email: string; exclude: string[] }; onClose: () => void }) {
  const { data: projects, isLoading } = useProjects('active');
  const admin = useCollaboratorsAdmin();
  const [form, setForm] = useState({ name: initial.name, email: initial.email, lead: '', send: true });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const options = (projects ?? []).filter((p) => !initial.exclude.includes(p.lead.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (!form.lead) {
      setErrors({ lead: ['Escolhe o projeto.'] });
      return;
    }
    try {
      const result = await admin.mutateAsync({ invite: { lead_id: form.lead, email: form.email, name: form.name || undefined, send_email: form.send } });
      if (!result) return;
      if (result.emailed) toast.success(`Convite enviado para ${result.collaborator.email}.`);
      else if (result.collaborator.token) {
        await navigator.clipboard.writeText(inviteUrl(result.collaborator.token)).catch(() => undefined);
        toast.success('Convite criado. O link foi copiado: envia-o ao colaborador.');
      } else toast.success('Adicionado ao projeto (já tem conta).');
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title={initial.email ? `Convidar ${initial.name || initial.email}` : 'Convidar colaborador'}
      description="Só vê as tarefas, os ficheiros, o briefing e as horas do projeto escolhido; nunca os valores nem os contactos do cliente."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="collab-invite" loading={admin.isPending}>
            <UserPlus className="h-4 w-4" aria-hidden /> Convidar
          </Button>
        </>
      }
    >
      <form id="collab-invite" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Projeto" required error={errors.lead?.[0]}>
          <Select value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })} disabled={isLoading}>
            <option value="">{isLoading ? 'A carregar…' : options.length ? 'Escolhe o projeto' : 'Sem projetos em curso'}</option>
            {options.map((p) => (
              <option key={p.lead.id} value={p.lead.id}>
                #{p.lead.number} {projectLabel(p.lead)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" error={errors.name?.[0]}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Rui Programador" />
        </Field>
        <Field label="Email do colaborador" required error={errors.email?.[0]}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@exemplo.pt" />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
          Enviar o convite por email (senão, o link é copiado)
        </label>
      </form>
    </Dialog>
  );
}
