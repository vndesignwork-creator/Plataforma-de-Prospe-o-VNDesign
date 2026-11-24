'use client';

/**
 * Acessos do cliente (domínio, alojamento, WordPress, redes sociais…): são os
 * mesmos em todos os projetos dele. As palavras-passe ficam cifradas no
 * servidor, só se mostram a pedido (e escondem-se sozinhas), e cada vez que se
 * vê uma fica registado em Definições → Registo.
 */
import type { Lead, LeadAccess } from '@vndesign/core';
import { Copy, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2, Users, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useAccessAction, useAccesses } from '@/lib/queries';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

/** A palavra-passe à vista esconde-se sozinha ao fim deste tempo. */
const HIDE_AFTER_MS = 30_000;

/** Palavra-passe com botão "Gerar" (o Field passa o id e o ARIA ao campo). */
function SecretInput({
  value,
  placeholder,
  onValue,
  ...aria
}: {
  value: string;
  placeholder?: string;
  onValue: (secret: string) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <PasswordInput {...aria} className="flex-1" placeholder={placeholder} value={value} onChange={(e) => onValue(e.target.value)} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          // Sem caracteres que se confundem (l, 1, O, 0).
          const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
          const bytes = crypto.getRandomValues(new Uint32Array(20));
          const nova = Array.from(bytes, (n) => alfabeto[n % alfabeto.length]).join('');
          onValue(nova);
          void copy(nova, 'Palavra-passe gerada');
        }}
      >
        <Wand2 className="h-3.5 w-3.5" aria-hidden /> Gerar
      </Button>
    </span>
  );
}

export function AccessesCard({ lead }: { lead: Lead }) {
  const { data: accesses } = useAccesses(lead.id);
  const action = useAccessAction(lead.id);
  const [editing, setEditing] = useState<LeadAccess | 'new' | null>(null);
  const [shown, setShown] = useState<Record<string, string | null>>({});
  // Esconde sozinha ao fim de meio minuto (não fica à vista no ecrã).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of Object.values(running)) clearTimeout(t);
    };
  }, []);
  // A lista pode ficar recolhida (com o número de acessos); a escolha fica lembrada neste browser.
  const [collapsed, setCollapsed] = useCollapsed('acessos');

  async function reveal(a: LeadAccess, then?: 'copy') {
    try {
      const secret = shown[a.id] ?? (await api<{ data: { secret: string | null } }>(`/accesses/${a.id}/secret`)).data.secret;
      if (then === 'copy') {
        if (secret) await copy(secret, 'Palavra-passe');
        return;
      }
      setShown((s) => {
        if (a.id in s) {
          clearTimeout(timers.current[a.id]);
          return Object.fromEntries(Object.entries(s).filter(([k]) => k !== a.id));
        }
        timers.current[a.id] = setTimeout(() => {
          setShown((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== a.id)));
        }, HIDE_AFTER_MS);
        return { ...s, [a.id]: secret };
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card id="acessos" className="scroll-mt-20">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-muted" aria-hidden /> Acessos
          </span>
        }
        description="Domínio, alojamento, WordPress, redes sociais… As palavras-passe ficam cifradas no servidor e só se mostram a pedido."
        actions={
          <>
            {!lead.anonymized_at ? (
              <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Acesso
              </Button>
            ) : null}
            {accesses?.length ? (
              <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label={`Acessos (${accesses.length})`} />
            ) : null}
          </>
        }
      />
      <div className="px-5 py-4">
      {accesses?.length && collapsed ? (
        <p className="text-sm text-muted">
          {accesses.length} acesso{accesses.length === 1 ? '' : 's'} guardado{accesses.length === 1 ? '' : 's'}.
        </p>
      ) : accesses?.length ? (
        <ul className="flex flex-col divide-y divide-border text-sm" aria-label="Acessos do cliente">
          {accesses.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer noopener" className="text-accent-text hover:underline">
                      {a.label}
                    </a>
                  ) : (
                    a.label
                  )}
                  {a.shared ? (
                    <Badge className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden /> Colaboradores
                    </Badge>
                  ) : null}
                </span>
                <span className="block text-xs text-muted">
                  {a.username ? (
                    <button type="button" onClick={() => void copy(a.username!, 'Utilizador')} className="hover:text-fg" title="Copiar">
                      {a.username}
                    </button>
                  ) : null}
                  {a.has_secret ? (
                    <span className="font-mono">
                      {a.username ? ' · ' : ''}
                      {a.id in shown ? shown[a.id] : '••••••••'}
                    </span>
                  ) : null}
                  {a.notes ? ` · ${a.notes}` : ''}
                </span>
              </span>
              {a.has_secret ? (
                <>
                  <button type="button" onClick={() => void reveal(a)} className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label={a.id in shown ? `Esconder a palavra-passe de ${a.label}` : `Mostrar a palavra-passe de ${a.label}`}>
                    {a.id in shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                  <button type="button" onClick={() => void reveal(a, 'copy')} className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Copiar a palavra-passe de ${a.label}`}>
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                </>
              ) : null}
              <button type="button" onClick={() => setEditing(a)} className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Editar ${a.label}`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => action.mutate({ id: a.id, remove: true }, { onSuccess: () => toast.success('Acesso apagado.'), onError: (e) => toast.error(errorMessage(e)) })}
                className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
                aria-label={`Apagar ${a.label}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Ainda não há acessos guardados.</p>
      )}
      </div>
      {editing ? <AccessDialog lead={lead} access={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function AccessDialog({ lead, access, onClose }: { lead: Lead; access: LeadAccess | null; onClose: () => void }) {
  const action = useAccessAction(lead.id);
  const [form, setForm] = useState({
    label: access?.label ?? '',
    url: access?.url ?? '',
    username: access?.username ?? '',
    secret: '',
    notes: access?.notes ?? '',
    shared: access?.shared ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await action.mutateAsync({ id: access?.id, body: { ...form, secret: form.secret || undefined } });
      toast.success(access ? 'Acesso guardado.' : 'Acesso juntado.');
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
      title={access ? `Editar ${access.label}` : 'Novo acesso'}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="access-form" loading={action.isPending} disabled={!form.label.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="access-form" onSubmit={submit} className="grid gap-3" noValidate>
        <Field label="O quê" required error={errors.label?.[0]}>
          <Input placeholder="Ex.: Alojamento Hostinger, Instagram, Domínio .pt" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        <Field label="Endereço para entrar" error={errors.url?.[0]}>
          <Input type="url" placeholder="https://hpanel.hostinger.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </Field>
        <Field label="Utilizador ou email">
          <Input autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Palavra-passe" hint={access?.has_secret ? 'Vazio mantém a palavra-passe guardada.' : 'Fica cifrada no servidor.'}>
          <SecretInput
            value={form.secret}
            placeholder={access?.has_secret ? 'Guardada (escreve para mudar)' : ''}
            onValue={(secret) => setForm({ ...form, secret })}
          />
        </Field>
        <Field label="Notas">
          <Input placeholder="Ex.: renova em março; código 2FA no telemóvel do cliente" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />
          Partilhar com os colaboradores dos projetos deste cliente
        </label>
      </form>
    </Dialog>
  );
}
