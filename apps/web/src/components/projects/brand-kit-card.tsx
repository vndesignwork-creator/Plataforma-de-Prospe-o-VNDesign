'use client';

/**
 * Kit da marca do cliente: logótipos e ficheiros, cores, tipos de letra, links
 * e acessos (domínio, alojamento, redes). É o mesmo em todos os projetos do
 * cliente; as palavras-passe ficam cifradas e só se mostram a pedido.
 */
import type { BrandKit, Lead, LeadAccess } from '@vndesign/core';
import { Copy, Download, Eye, EyeOff, KeyRound, Link2, Palette, Pencil, Plus, Trash2, Type, Upload, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { useAccessAction, useAccesses, useBrandKit, useBrandKitAction } from '@/lib/queries';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function BrandKitCard({ lead }: { lead: Lead }) {
  const { data: kit, isLoading } = useBrandKit(lead.id);
  const [editing, setEditing] = useState(false);
  return (
    <Card id="kit-marca" className="scroll-mt-20">
      <CardHeader
        title="Kit da marca"
        description="Logótipos, cores, tipos de letra e acessos do cliente (iguais em todos os projetos dele)."
        actions={
          !editing && !lead.anonymized_at ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
            </Button>
          ) : null
        }
      />
      {isLoading || !kit ? (
        <div className="p-4">
          <Skeleton className="h-16" />
        </div>
      ) : editing ? (
        <KitEditor lead={lead} kit={kit} onDone={() => setEditing(false)} />
      ) : (
        <KitView lead={lead} kit={kit} />
      )}
      <FilesSection lead={lead} kit={kit} />
      <AccessesSection lead={lead} />
    </Card>
  );
}

function KitView({ kit }: { lead: Lead; kit: BrandKit }) {
  const empty = !kit.colors.length && !kit.fonts.length && !kit.links.length && !kit.notes;
  if (empty) return <p className="px-4 py-3 text-sm text-muted">Ainda vazio: carrega em Editar para juntar as cores, os tipos de letra e os links.</p>;
  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm">
      {kit.colors.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Cores">
          {kit.colors.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => void copy(c.hex, `Cor ${c.hex}`)}
                className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 hover:border-border-strong"
                title="Copiar o código da cor"
              >
                <span className="h-6 w-6 rounded-md border border-border" style={{ backgroundColor: c.hex }} aria-hidden />
                <span className="text-left leading-tight">
                  {c.name ? <span className="block text-xs">{c.name}</span> : null}
                  <span className="block font-mono text-xs text-muted uppercase">{c.hex}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {kit.fonts.length ? (
        <ul className="flex flex-col gap-0.5" aria-label="Tipos de letra">
          {kit.fonts.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <Type className="h-3.5 w-3.5 text-muted" aria-hidden />
              <span className="font-medium">{f.name}</span>
              {f.usage ? <span className="text-muted">· {f.usage}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {kit.links.length ? (
        <ul className="flex flex-col gap-0.5" aria-label="Links">
          {kit.links.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-muted" aria-hidden />
              <a href={l.url} target="_blank" rel="noreferrer noopener" className="truncate text-accent-text hover:underline">
                {l.label || l.url.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {kit.notes ? <p className="whitespace-pre-line text-muted">{kit.notes}</p> : null}
    </div>
  );
}

function KitEditor({ lead, kit, onDone }: { lead: Lead; kit: BrandKit; onDone: () => void }) {
  const action = useBrandKitAction(lead.id);
  const [colors, setColors] = useState(kit.colors.length ? kit.colors : [{ name: '', hex: '#ef5c32' }]);
  const [fonts, setFonts] = useState(kit.fonts);
  const [links, setLinks] = useState(kit.links);
  const [notes, setNotes] = useState(kit.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await action.mutateAsync({
        body: {
          colors: colors.filter((c) => c.hex.trim()),
          fonts: fonts.filter((f) => f.name.trim()),
          links: links.filter((l) => l.url.trim()),
          notes,
        },
      });
      toast.success('Kit da marca guardado.');
      onDone();
    } catch (error) {
      if (error instanceof ApiClientError && error.problem.errors) setErrors(error.problem.errors as Record<string, string[]>);
      else toast.error(errorMessage(error));
    }
  }

  const firstError = Object.values(errors)[0]?.[0];
  return (
    <form onSubmit={save} className="flex flex-col gap-4 px-4 py-3 text-sm" aria-label="Editar o kit da marca">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 inline-flex items-center gap-1.5 font-medium">
          <Palette className="h-4 w-4 text-muted" aria-hidden /> Cores
        </legend>
        {colors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`Cor ${i + 1}`}
              value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'}
              onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
              className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
            />
            <Input aria-label={`Código da cor ${i + 1}`} value={c.hex} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} className="w-28 font-mono" />
            <Input aria-label={`Nome da cor ${i + 1}`} placeholder="Ex.: Laranja principal" value={c.name} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setColors(colors.filter((_, j) => j !== i))} aria-label={`Tirar a cor ${i + 1}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setColors([...colors, { name: '', hex: '#000000' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Cor
        </Button>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 inline-flex items-center gap-1.5 font-medium">
          <Type className="h-4 w-4 text-muted" aria-hidden /> Tipos de letra
        </legend>
        {fonts.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Tipo de letra ${i + 1}`} placeholder="Ex.: Plus Jakarta Sans" value={f.name} onChange={(e) => setFonts(fonts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input aria-label={`Uso do tipo de letra ${i + 1}`} placeholder="Ex.: títulos" value={f.usage} onChange={(e) => setFonts(fonts.map((x, j) => (j === i ? { ...x, usage: e.target.value } : x)))} className="w-36" />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setFonts(fonts.filter((_, j) => j !== i))} aria-label={`Tirar o tipo de letra ${i + 1}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setFonts([...fonts, { name: '', usage: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Tipo de letra
        </Button>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 inline-flex items-center gap-1.5 font-medium">
          <Link2 className="h-4 w-4 text-muted" aria-hidden /> Links (Drive, Figma, manual de marca…)
        </legend>
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Nome do link ${i + 1}`} placeholder="Ex.: Pasta do Drive" value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="w-40" />
            <Input aria-label={`Endereço do link ${i + 1}`} type="url" placeholder="https://…" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label={`Tirar o link ${i + 1}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setLinks([...links, { label: '', url: '' }])}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Link
        </Button>
      </fieldset>
      <Field label="Notas">
        <Textarea rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: o logótipo branco só em fundos escuros; tom de voz próximo." />
      </Field>
      {firstError ? (
        <p role="alert" className="text-sm text-danger">
          {firstError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" loading={action.isPending}>
          Guardar kit
        </Button>
      </div>
    </form>
  );
}

function FilesSection({ lead, kit }: { lead: Lead; kit: BrandKit | undefined }) {
  const action = useBrandKitAction(lead.id);
  const files = kit?.files ?? [];

  async function upload(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (!chosen.length) return;
    try {
      await action.mutateAsync({ files: chosen });
      toast.success(chosen.length === 1 ? 'Ficheiro guardado.' : `${chosen.length} ficheiros guardados.`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-label="Ficheiros da marca" className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Logótipos e ficheiros</h3>
        {!lead.anonymized_at ? (
          <>
            <input id={`brand-files-${lead.id}`} type="file" multiple className="sr-only" onChange={(e) => void upload(e.target.files).then(() => (e.target.value = ''))} />
            <label htmlFor={`brand-files-${lead.id}`} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-surface-2">
              <Upload className="h-3.5 w-3.5" aria-hidden /> {action.isPending ? 'A enviar…' : 'Juntar ficheiros'}
            </label>
          </>
        ) : null}
      </div>
      {files.length ? (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Ficheiros do kit">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
              {f.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- ficheiro privado servido pela API
                <img src={f.url} alt="" className="h-10 w-10 shrink-0 rounded bg-surface-2 object-contain" loading="lazy" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-2 text-xs text-muted uppercase">
                  {f.name.split('.').pop()?.slice(0, 4)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block text-xs text-muted">{kb(f.size)}</span>
              </span>
              <a href={f.url} className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label={`Descarregar ${f.name}`}>
                <Download className="h-4 w-4" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => action.mutate({ removeFile: i }, { onSuccess: () => toast.success('Ficheiro apagado.'), onError: (e) => toast.error(errorMessage(e)) })}
                className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
                aria-label={`Apagar ${f.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">Logótipo em várias versões, manual de marca, fotografias… (até 30 ficheiros de 25 MB).</p>
      )}
    </section>
  );
}

function AccessesSection({ lead }: { lead: Lead }) {
  const { data: accesses } = useAccesses(lead.id);
  const action = useAccessAction(lead.id);
  const [editing, setEditing] = useState<LeadAccess | 'new' | null>(null);
  const [shown, setShown] = useState<Record<string, string | null>>({});

  async function reveal(a: LeadAccess, then?: 'copy') {
    try {
      const secret = shown[a.id] ?? (await api<{ data: { secret: string | null } }>(`/accesses/${a.id}/secret`)).data.secret;
      if (then === 'copy') {
        if (secret) await copy(secret, 'Palavra-passe');
        return;
      }
      setShown((s) => (a.id in s ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== a.id)) : { ...s, [a.id]: secret }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section aria-label="Acessos" className="border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-muted" aria-hidden /> Acessos
        </h3>
        {!lead.anonymized_at ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Acesso
          </Button>
        ) : null}
      </div>
      {accesses?.length ? (
        <ul className="mt-2 flex flex-col divide-y divide-border text-sm" aria-label="Acessos do cliente">
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
        <p className="mt-1 text-sm text-muted">Domínio, alojamento, WordPress, redes sociais… As palavras-passe ficam cifradas.</p>
      )}
      {editing ? <AccessDialog lead={lead} access={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </section>
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
          <PasswordInput autoComplete="new-password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
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
