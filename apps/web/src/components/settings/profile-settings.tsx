'use client';

/**
 * Definições → Conta → Perfil: a foto (recortada ao centro e reduzida no browser
 * antes de enviar) e o nome a mostrar (alcunha) no menu, na equipa e no
 * "Responsável". O nome completo dos emails continua na Assinatura.
 */
import { AVATAR_SIZE, PROFILE_NAME_MAX, type Me, type Profile } from '@vndesign/core';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { qk, useMe } from '@/lib/queries';

/** Recorta o quadrado do centro e reduz para AVATAR_SIZE (WebP; JPEG se o browser não fizer WebP). */
async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível ler a imagem.');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const blob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
  const out = (await blob('image/webp')) ?? (await blob('image/jpeg'));
  if (!out) throw new Error('Não foi possível preparar a foto.');
  return out;
}

export function ProfileSettings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const profile = me?.profile;
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const value = name ?? profile?.display_name ?? '';

  function apply(next: Profile) {
    qc.setQueryData<Me>(qk.me, (old) => (old ? { ...old, profile: next } : old));
    // Os nomes da equipa (Responsável, atividade) também usam a alcunha.
    void qc.invalidateQueries({ queryKey: ['team'] });
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api<{ data: Profile }>('/me/profile', { method: 'PATCH', body: { display_name: value.trim() || null } });
      apply(data);
      setName(null);
      toast.success('Nome guardado.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Escolhe uma imagem (JPEG, PNG ou WebP).');
      return;
    }
    setUploading(true);
    try {
      const blob = await squareImage(file);
      const form = new FormData();
      form.append('file', new File([blob], blob.type === 'image/webp' ? 'foto.webp' : 'foto.jpg', { type: blob.type }));
      const res = await fetch('/api/v1/me/avatar', { method: 'POST', body: form, credentials: 'same-origin' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new ApiClientError(res.status, payload ?? { type: 'about:blank', title: 'Falha no envio', status: res.status });
      apply((payload as { data: Profile }).data);
      toast.success('Foto guardada.');
    } catch (error) {
      toast.error(error instanceof Error && !(error instanceof ApiClientError) ? error.message : errorMessage(error));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  async function removePhoto() {
    try {
      const { data } = await api<{ data: Profile }>('/me/avatar', { method: 'DELETE' });
      apply(data);
      toast.success('Foto tirada.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card id="perfil">
      <CardHeader title="Perfil" description="A tua foto e o nome que aparece no menu, na equipa e no “Responsável” dos leads." />
      <div className="grid gap-6 p-4 md:grid-cols-[auto_1fr] md:items-start">
        <div className="flex items-center gap-4 md:flex-col md:items-center">
          <Avatar name={profile?.name ?? '?'} url={profile?.avatar_url} size={88} />
          <div className="flex flex-wrap gap-2 md:justify-center">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Escolher foto"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button size="sm" variant="outline" onClick={() => input.current?.click()} loading={uploading}>
              <Camera className="h-3.5 w-3.5" aria-hidden /> {profile?.avatar_url ? 'Mudar foto' : 'Escolher foto'}
            </Button>
            {profile?.avatar_url ? (
              <Button size="sm" variant="ghost" onClick={() => void removePhoto()}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Tirar foto
              </Button>
            ) : null}
          </div>
        </div>
        <form onSubmit={saveName} className="flex flex-col gap-3" noValidate>
          <Field
            label="Nome a mostrar"
            hint={
              <>
                Um nome curto ou uma alcunha (ex.: “Va”). Vazio = o nome da{' '}
                <Link href="/definicoes/assinatura" className="text-accent-text hover:underline">
                  Assinatura
                </Link>
                , que continua a ser o dos emails.
              </>
            }
          >
            <Input value={value} maxLength={PROFILE_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={profile?.name ?? ''} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={saving} disabled={name === null}>
              Guardar nome
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
