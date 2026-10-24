'use client';

/**
 * 📷 Ler cartão de visita (novo lead): tira uma fotografia (no telemóvel abre a
 * câmara), a IA lê-a e o formulário fica preenchido para rever. A foto é
 * reduzida antes de enviar e não fica guardada.
 */
import type { CardScanResult } from '@vndesign/core';
import { Camera, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { buttonClasses } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api-client';

/** Reduz a fotografia (no máximo 1600 px de lado, JPEG) e devolve um data URL. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function CardScanButton({ onResult }: { onResult: (data: CardScanResult) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: File) {
    setBusy(true);
    try {
      const image = await shrink(file);
      const { data } = await api<{ data: CardScanResult }>('/leads/card-scan', { method: 'POST', body: { image } });
      onResult(data);
      toast.success('Cartão lido: revê os dados antes de criar o lead.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm">
      <label className={buttonClasses('outline', 'sm', busy ? 'pointer-events-none opacity-60' : 'cursor-pointer')}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4 text-accent-text" aria-hidden />}
        {busy ? 'A ler o cartão…' : 'Ler cartão de visita'}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Fotografia do cartão de visita"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
          }}
        />
      </label>
      <span className="text-muted">Tira uma foto ao cartão: a IA preenche a empresa, o contacto, o email, o telefone e o site.</span>
    </div>
  );
}
