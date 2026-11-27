'use client';

/**
 * Acessos do cliente (domínio, alojamento, WordPress, redes sociais…): são os
 * mesmos em todos os projetos dele. As palavras-passe ficam cifradas no
 * servidor, só se mostram a pedido (e escondem-se sozinhas), e cada vez que se
 * vê uma fica registado em Definições → Registo.
 */
import { accessIsStale, accessSecretAge, formatDate, type Lead, type LeadAccess } from '@vndesign/core';
import { Copy, CopyPlus, ExternalLink, Eye, EyeOff, KeyRound, MoreVertical, PackageCheck, Pencil, Plus, ShieldAlert, Trash2, Users, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CollapseButton, useCollapsed } from '@/components/ui/collapse';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from '@/components/ui/dropdown';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { confirmar } from '@/components/ui/confirm';
import { useAccessAction, useAccessHandover, useAccesses } from '@/lib/queries';

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

/** Confirmar a palavra-passe da conta antes de ver as dos clientes. */
function UnlockDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<{ data: { minutes: number } }>('/accesses/unlock', { method: 'POST', body: { password } });
      toast.success(`Confirmado: podes ver as palavras-passe durante ${data.minutes} minutos.`);
      onUnlocked();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Confirma a tua palavra-passe"
      description="As palavras-passe dos clientes só se mostram depois de confirmares que és tu."
      className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="unlock-form" loading={busy} disabled={!password}>
            Confirmar
          </Button>
        </>
      }
    >
      <form id="unlock-form" onSubmit={submit} className="flex flex-col gap-3" noValidate>
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Field label="A tua palavra-passe">
          <PasswordInput autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/** O endereço como se lê (sem o "https://" nem a barra do fim), para caber na linha. */
function enderecoCurto(url: string) {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function AccessesCard({ lead }: { lead: Lead }) {
  const { data: accesses } = useAccesses(lead.id);
  const action = useAccessAction(lead.id);
  // 'new' = acesso novo; { copyOf } = novo a partir de outro (duplicar); o resto = editar.
  const [editing, setEditing] = useState<LeadAccess | 'new' | { copyOf: LeadAccess } | null>(null);
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
  const [handover, setHandover] = useState(false);

  const [unlocking, setUnlocking] = useState<{ access: LeadAccess; then?: 'copy' } | null>(null);

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
      // Falta confirmar a palavra-passe da conta: pergunta e repete a seguir.
      if (error instanceof ApiClientError && (error.problem as { code?: string }).code === 'unlock_required') {
        setUnlocking({ access: a, then });
        return;
      }
      toast.error(errorMessage(error));
    }
  }

  // Ainda sem acessos: o cartão fica numa linha só (título + "Acesso").
  const vazio = !accesses?.length;

  return (
    <Card id="acessos" className="scroll-mt-20">
      <CardHeader
        compact={vazio}
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
            {/* Fim do trabalho: entregar ao cliente e deixar de guardar as palavras-passe. */}
            {accesses?.length && !lead.anonymized_at ? (
              <Button size="sm" variant="ghost" onClick={() => setHandover(true)}>
                <PackageCheck className="h-3.5 w-3.5" aria-hidden /> Entregar…
              </Button>
            ) : null}
            {accesses?.length ? (
              <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} label={`Acessos (${accesses.length})`} />
            ) : null}
          </>
        }
      />
      <div className={vazio ? 'hidden' : 'px-5 py-4'}>
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
                    <a href={a.url} target="_blank" rel="noreferrer noopener" className="text-accent-text hover:text-accent-text-strong">
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
                  {/* Palavra-passe guardada há mais de um ano: vale a pena trocá-la. */}
                  {accessIsStale(a) ? (
                    <Badge tone="warning" className="inline-flex items-center gap-1" title={`Guardada desde ${formatDate(a.secret_changed_at!.slice(0, 10))}`}>
                      <ShieldAlert className="h-3 w-3" aria-hidden /> Trocar ({Math.floor((accessSecretAge(a) ?? 0) / 30)} meses)
                    </Badge>
                  ) : null}
                  {a.handed_over_at ? (
                    <Badge tone="success" className="inline-flex items-center gap-1" title={`Entregue em ${formatDate(a.handed_over_at.slice(0, 10))}`}>
                      <PackageCheck className="h-3 w-3" aria-hidden /> Entregue
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
                {/* Onde está guardada, quando não está aqui. */}
                {a.vault_ref ? (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <KeyRound className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{a.vault_ref}</span>
                  </span>
                ) : null}
                {/* O endereço à vista: dá para ver qual é o painel sem ter de abrir o link. */}
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={a.url}
                    className="inline-flex max-w-full min-w-0 items-center gap-1 text-xs text-muted hover:text-accent-text"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{enderecoCurto(a.url)}</span>
                    <span className="sr-only">(abre num novo separador)</span>
                  </a>
                ) : null}
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
              <DropdownRoot>
                <DropdownTrigger className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Mais ações: ${a.label}`}>
                  <MoreVertical className="h-4 w-4" aria-hidden />
                </DropdownTrigger>
                <DropdownContent align="end">
                  {/* Duplicar: o mesmo painel com outro utilizador, ou o mesmo acesso noutra conta. */}
                  <DropdownItem onSelect={() => setEditing({ copyOf: a })}>
                    <CopyPlus className="h-4 w-4" aria-hidden /> Duplicar…
                  </DropdownItem>
                  <DropdownItem
                    danger
                    onSelect={() => {
                      void confirmar({
                        title: `Apagar "${a.label}"?`,
                        description: a.has_secret ? 'A palavra-passe guardada também é apagada.' : undefined,
                        confirm: 'Apagar',
                        danger: true,
                      }).then((ok) => {
                        if (ok) action.mutate({ id: a.id, remove: true }, { onSuccess: () => toast.success('Acesso apagado.'), onError: (e) => toast.error(errorMessage(e)) });
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Apagar…
                  </DropdownItem>
                </DropdownContent>
              </DropdownRoot>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Ainda não há acessos guardados.</p>
      )}
      </div>
      {editing ? (
        <AccessDialog
          lead={lead}
          access={editing === 'new' || 'copyOf' in editing ? null : editing}
          copyOf={editing !== 'new' && 'copyOf' in editing ? editing.copyOf : null}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {handover ? <HandoverDialog lead={lead} accesses={accesses ?? []} onClose={() => setHandover(false)} /> : null}
      {unlocking ? (
        <UnlockDialog
          onClose={() => setUnlocking(null)}
          onUnlocked={() => {
            const pedido = unlocking;
            setUnlocking(null);
            void reveal(pedido.access, pedido.then);
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * Entregar os acessos ao cliente (fim do trabalho): escolhe-se o que se entrega,
 * fica registado na linha do tempo e, por omissão, as palavras-passe guardadas
 * aqui são apagadas — o endereço e o utilizador ficam.
 */
function HandoverDialog({ lead, accesses, onClose }: { lead: Lead; accesses: LeadAccess[]; onClose: () => void }) {
  const handover = useAccessHandover(lead.id);
  const porEntregar = accesses.filter((a) => !a.handed_over_at);
  const [ids, setIds] = useState<string[]>((porEntregar.length ? porEntregar : accesses).map((a) => a.id));
  const [apagar, setApagar] = useState(true);
  const comPalavraPasse = accesses.filter((a) => ids.includes(a.id) && a.has_secret).length;

  async function submit() {
    if (
      apagar &&
      comPalavraPasse &&
      !(await confirmar({
        title: `Apagar ${comPalavraPasse} palavra${comPalavraPasse === 1 ? '' : 's'}-passe guardada${comPalavraPasse === 1 ? '' : 's'}?`,
        description: 'Os acessos ficam na ficha (endereço e utilizador), mas as palavras-passe deixam de estar guardadas aqui. Não dá para anular.',
        confirm: 'Entregar e apagar',
        danger: true,
      }))
    )
      return;
    try {
      await handover.mutateAsync({ ids, delete_secrets: apagar });
      toast.success(apagar ? 'Acessos entregues e palavras-passe apagadas.' : 'Acessos marcados como entregues.');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => (!o ? onClose() : undefined)}
      title="Entregar os acessos ao cliente"
      description="Quando o trabalho acaba, passa os acessos para o nome do cliente e deixa de os guardar aqui."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={handover.isPending} disabled={!ids.length}>
            Marcar como entregues
          </Button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-border text-sm" aria-label="Acessos a entregar">
        {accesses.map((a) => (
          <li key={a.id} className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0"
              checked={ids.includes(a.id)}
              onChange={(e) => setIds((list) => (e.target.checked ? [...list, a.id] : list.filter((id) => id !== a.id)))}
              aria-label={`Entregar ${a.label}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.label}</span>
              <span className="block truncate text-xs text-muted">
                {[a.username, a.has_secret ? 'com palavra-passe guardada' : null, a.handed_over_at ? 'já entregue' : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <label className="mt-4 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={apagar} onChange={(e) => setApagar(e.target.checked)} />
        <span>
          Apagar as palavras-passe guardadas aqui
          <span className="block text-xs text-muted">
            Recomendado: depois de entregues, o cliente é que manda nelas. O acesso fica na ficha com o endereço e o utilizador.
          </span>
        </span>
      </label>
    </Dialog>
  );
}

function AccessDialog({
  lead,
  access,
  copyOf = null,
  onClose,
}: {
  lead: Lead;
  access: LeadAccess | null;
  /** Duplicar: vem tudo preenchido a partir deste, menos a palavra-passe. */
  copyOf?: LeadAccess | null;
  onClose: () => void;
}) {
  const action = useAccessAction(lead.id);
  const base = access ?? copyOf;
  const [form, setForm] = useState({
    label: access?.label ?? (copyOf ? `${copyOf.label} (cópia)` : ''),
    url: base?.url ?? '',
    username: base?.username ?? '',
    secret: '',
    notes: base?.notes ?? '',
    shared: base?.shared ?? false,
    vault_ref: base?.vault_ref ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await action.mutateAsync({ id: access?.id, body: { ...form, secret: form.secret || undefined } });
      toast.success(access ? 'Acesso guardado.' : copyOf ? 'Acesso duplicado.' : 'Acesso juntado.');
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
      title={access ? `Editar ${access.label}` : copyOf ? `Duplicar ${copyOf.label}` : 'Novo acesso'}
      description={copyOf ? 'Vem tudo do original menos a palavra-passe — escreve a nova (ou deixa vazia).' : undefined}
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
        <Field
          label="Onde está guardada (em vez de aqui)"
          hint="Se preferires não guardar a palavra-passe aqui, diz só onde ela está."
          error={errors.vault_ref?.[0]}
        >
          <Input
            placeholder="Ex.: Bitwarden · Clientes/Glowearo"
            value={form.vault_ref}
            onChange={(e) => setForm({ ...form, vault_ref: e.target.value })}
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
