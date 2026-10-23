'use client';

/**
 * Equipa (menu): quem trabalha contigo, em dois separadores.
 * - Prospeção: pessoas com conta na plataforma (prospetor ou administrador).
 * - Projetos: colaboradores externos, cada um só no(s) projeto(s) para onde foi convidado.
 * Um só "Convidar", que pergunta primeiro para quê.
 */
import { MEMBER_ROLE_LABELS, projectLabel, type CollaboratorPerson, type InviteRole } from '@vndesign/core';
import { BriefcaseBusiness, History, Target, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CollaboratorsList, collabInviteUrl } from '@/components/collaborators/collaborators-view';
import { TeamActivityList } from './team-activity';
import { GenerationLimitCard, ProspectorAccessCard, TeamMembers, teamInviteUrl } from '@/components/settings/team-settings';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useAllCollaborators, useCollaboratorsAdmin, useProjects, useSettings, useTeam, useTeamAction } from '@/lib/queries';
import { cn } from '@/lib/utils';

export type TeamTab = 'prospecao' | 'projetos' | 'atividade';
type Kind = 'leads' | 'project';
type InviteInitial = { kind: Kind; name: string; email: string; exclude: string[] };

export function TeamView({ initialTab }: { initialTab: TeamTab }) {
  const { data: settings } = useSettings();
  // Os colaboradores dos projetos só existem com Projetos e Colaboradores ligados (Definições → Funcionalidades).
  const projectsOn = !!settings?.features.projects && !!settings.features.collaborators;
  const { data: team } = useTeam();
  const { data: collaborators } = useAllCollaborators(projectsOn);
  const [chosen, setChosen] = useState<TeamTab>(initialTab);
  const tab: TeamTab = chosen === 'projetos' && !projectsOn ? 'prospecao' : chosen;
  const [inviting, setInviting] = useState<InviteInitial | null>(null);

  function select(next: TeamTab) {
    setChosen(next);
    // O separador fica no endereço (voltar atrás ou partilhar o link abre o mesmo).
    window.history.replaceState(null, '', next === 'prospecao' ? '/equipa' : `/equipa?ver=${next}`);
  }

  const tabs: { id: TeamTab; label: string; icon: typeof Target; count?: number }[] = [
    { id: 'prospecao', label: 'Prospeção', icon: Target, count: team ? team.members.length + team.invites.length : undefined },
    ...(projectsOn ? [{ id: 'projetos' as const, label: 'Projetos', icon: BriefcaseBusiness, count: collaborators?.length }] : []),
    { id: 'atividade', label: 'Atividade', icon: History },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Telemóvel: Convidar por cima dos separadores (os separadores ficam colados à linha). */}
      <div className="flex flex-col-reverse items-start gap-3 border-b border-border sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label="Equipa" className="-mb-px flex gap-1">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`painel-${id}`}
              onClick={() => select(id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm transition-colors',
                tab === id ? 'border-accent font-medium text-accent-text' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              {count !== undefined ? <span className="rounded bg-surface-3 px-1.5 text-xs font-medium tabular text-muted">{count}</span> : null}
            </button>
          ))}
        </div>
        <Button className="sm:mb-2" onClick={() => setInviting({ kind: tab === 'projetos' ? 'project' : 'leads', name: '', email: '', exclude: [] })}>
          <UserPlus className="h-4 w-4" aria-hidden /> Convidar
        </Button>
      </div>

      {tab === 'prospecao' ? (
        <div role="tabpanel" id="painel-prospecao" aria-labelledby="tab-prospecao" className="flex flex-col gap-5">
          <TeamMembers />
          <ProspectorAccessCard />
          <GenerationLimitCard />
        </div>
      ) : tab === 'atividade' ? (
        <div role="tabpanel" id="painel-atividade" aria-labelledby="tab-atividade">
          <TeamActivityList />
        </div>
      ) : (
        <div role="tabpanel" id="painel-projetos" aria-labelledby="tab-projetos">
          <p className="mb-4 text-sm text-muted">
            Programadores, fotógrafos, copywriters…: cada um só vê as tarefas, os ficheiros, o briefing e as horas do projeto para onde o convidaste.
          </p>
          <CollaboratorsList
            onInvite={(p: CollaboratorPerson) => setInviting({ kind: 'project', name: p.name ?? '', email: p.email, exclude: p.projects.map((x) => x.lead.id) })}
          />
        </div>
      )}

      {inviting ? (
        <InviteDialog
          initial={inviting}
          projectsOn={projectsOn}
          onClose={() => setInviting(null)}
          onDone={(kind) => select(kind === 'project' ? 'projetos' : 'prospecao')}
        />
      ) : null}
    </div>
  );
}

const KINDS: { id: Kind; title: string; text: string; icon: typeof Target }[] = [
  { id: 'leads', title: 'Ajudar com leads', text: 'Procurar, gerar, organizar e contactar. Tem conta na plataforma.', icon: Target },
  { id: 'project', title: 'Trabalhar num projeto', text: 'Só vê esse projeto: tarefas, ficheiros, briefing e horas.', icon: BriefcaseBusiness },
];

function InviteDialog({
  initial,
  projectsOn,
  onClose,
  onDone,
}: {
  initial: InviteInitial;
  projectsOn: boolean;
  onClose: () => void;
  onDone: (kind: Kind) => void;
}) {
  const [kind, setKind] = useState<Kind>(projectsOn ? initial.kind : 'leads');
  const [form, setForm] = useState({ name: initial.name, email: initial.email, role: 'prospector' as InviteRole, lead: '', send: true });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const team = useTeamAction();
  const collab = useCollaboratorsAdmin();
  const { data: projects, isLoading } = useProjects('active', projectsOn && kind === 'project');
  const options = (projects ?? []).filter((p) => !initial.exclude.includes(p.lead.id));
  const busy = team.isPending || collab.isPending;

  async function copied(url: string, who: string) {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    toast.success(`Convite criado. O link foi copiado: envia-o ${who}.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      if (kind === 'leads') {
        const result = await team.mutateAsync({ invite: { email: form.email, name: form.name || undefined, role: form.role, send_email: form.send } });
        if (!result || !('invite' in result)) return;
        if (result.emailed) toast.success(`Convite enviado para ${result.invite.email}.`);
        else await copied(teamInviteUrl(result.invite.token), 'à pessoa');
      } else {
        if (!form.lead) {
          setErrors({ lead: ['Escolhe o projeto.'] });
          return;
        }
        const result = await collab.mutateAsync({ invite: { lead_id: form.lead, email: form.email, name: form.name || undefined, send_email: form.send } });
        if (!result) return;
        if (result.emailed) toast.success(`Convite enviado para ${result.collaborator.email}.`);
        else if (result.collaborator.token) await copied(collabInviteUrl(result.collaborator.token), 'ao colaborador');
        else toast.success('Adicionado ao projeto (já tem conta).');
      }
      onDone(kind);
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
      title={initial.email ? `Convidar ${initial.name || initial.email}` : 'Convidar'}
      description={
        kind === 'leads'
          ? 'O prospetor só vê a parte comercial (sem valores, propostas, pagamentos nem projetos); o administrador vê tudo, como tu.'
          : 'Só vê as tarefas, os ficheiros, o briefing e as horas do projeto escolhido; nunca os valores nem os contactos do cliente.'
      }
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="team-invite" loading={busy}>
            <UserPlus className="h-4 w-4" aria-hidden /> Convidar
          </Button>
        </>
      }
    >
      <form id="team-invite" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        {projectsOn ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Para quê?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {KINDS.map(({ id, title, text, icon: Icon }) => (
                <label
                  key={id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
                    kind === id ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-muted',
                  )}
                >
                  <input type="radio" name="kind" value={id} checked={kind === id} onChange={() => setKind(id)} className="sr-only" />
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', kind === id ? 'text-accent-text' : 'text-muted')} aria-hidden />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs text-muted">{text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {kind === 'leads' ? (
          <Field label="Papel">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as InviteRole })}>
              <option value="prospector">{MEMBER_ROLE_LABELS.prospector} — só a parte comercial</option>
              <option value="admin">{MEMBER_ROLE_LABELS.admin} — tudo, como tu</option>
            </Select>
          </Field>
        ) : (
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
        )}
        <Field label="Nome" error={errors.name?.[0]}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={kind === 'leads' ? 'Ex.: Paula' : 'Ex.: Rui Programador'} />
        </Field>
        <Field label="Email" required error={errors.email?.[0]}>
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
