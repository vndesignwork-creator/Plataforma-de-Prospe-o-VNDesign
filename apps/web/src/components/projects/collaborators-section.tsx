'use client';

/**
 * Colaboradores do projeto: convidar por email (programador, fotógrafo…). Cada
 * um entra com conta própria e só vê as tarefas, as entregas, o briefing e as
 * suas horas deste projeto — nunca os leads, contactos ou valores.
 */
import { formatDate, type Lead } from '@vndesign/core';
import { Copy, Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { useCollaboratorAction, useCollaborators } from '@/lib/queries';
import { SectionHeader } from './section-header';

const inviteUrl = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/convite/${token}`;

export function CollaboratorsSection({ lead }: { lead: Lead }) {
  const { data } = useCollaborators(lead.id);
  const action = useCollaboratorAction(lead.id);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', send: true });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      const result = await action.mutateAsync({ invite: { email: form.email, name: form.name || undefined, send_email: form.send } });
      if (!result) return;
      setForm({ name: '', email: '', send: true });
      setAdding(false);
      if (result.emailed) toast.success(`Convite enviado para ${result.collaborator.email}.`);
      else {
        await copy(result.collaborator.token!);
        toast.success('Convite criado. O link foi copiado: envia-o ao colaborador.');
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      toast.success('Link do convite copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  }

  async function remove(id: string) {
    try {
      await action.mutateAsync({ remove: id });
      setConfirm(null);
      toast.success('Colaborador removido: já não tem acesso ao projeto.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-labelledby={`collab-${lead.id}`} className="border-t border-border px-4 py-3">
      <SectionHeader
        id={`collab-${lead.id}`}
        icon={Users}
        title="Colaboradores"
        summary={data?.length ? `${data.length}` : null}
        action={
          adding ? null : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!!lead.anonymized_at}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> Convidar
            </Button>
          )
        }
      />
      {data?.length ? (
        <ul className="mt-2 flex flex-col divide-y divide-border text-sm" aria-label="Colaboradores do projeto">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.name ?? c.email}</span>
                {c.name ? <span className="text-muted"> · {c.email}</span> : null}
              </span>
              {c.status === 'ativo' ? (
                <Badge tone="success">Ativo{c.accepted_at ? ` desde ${formatDate(c.accepted_at.slice(0, 10))}` : ''}</Badge>
              ) : (
                <>
                  <Badge tone="warning">Convite por aceitar</Badge>
                  <Button size="sm" variant="ghost" onClick={() => void copy(c.token!)} aria-label={`Copiar o link do convite de ${c.email}`}>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Link
                  </Button>
                </>
              )}
              {confirm === c.id ? (
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-muted">Remover?</span>
                  <Button size="sm" variant="danger" onClick={() => void remove(c.id)} loading={action.isPending}>
                    Sim
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    Não
                  </Button>
                </span>
              ) : (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConfirm(c.id)} aria-label={`Remover ${c.email}`}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="mt-1 text-sm text-muted">Convida um programador, fotógrafo ou copywriter: só vê as tarefas, os ficheiros, o briefing e as horas deste projeto.</p>
      ) : null}
      {adding ? (
        <form onSubmit={invite} className="mt-2 flex flex-col gap-2" aria-label="Convidar colaborador">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Nome (opcional)" aria-label="Nome" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div>
              <Input
                type="email"
                inputMode="email"
                placeholder="email@exemplo.pt"
                aria-label="Email do colaborador"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!errors.email}
              />
              {errors.email ? <p className="mt-1 text-xs text-danger">{errors.email[0]}</p> : null}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
            Enviar o convite por email
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={action.isPending} disabled={!form.email.trim()}>
              Convidar
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
