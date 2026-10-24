'use client';

/**
 * Nota afixada: uma frase sempre à vista no topo da ficha (e na Prospeção),
 * por exemplo "Só atende depois das 15h". Edita-se no sítio; vazia, sai.
 */
import type { Lead } from '@vndesign/core';
import { Pin, PinOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useUpdateLead } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** A caixa amarela com a nota (só leitura; `onEdit` mostra o lápis). */
export function PinnedNoteBox({ note, onEdit, className }: { note: string | null | undefined; onEdit?: () => void; className?: string }) {
  if (!note) return null;
  return (
    <div role="note" aria-label="Nota afixada" className={cn('flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm', className)}>
      <Pin className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 font-medium break-words">{note}</p>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="shrink-0 text-xs text-muted hover:text-fg hover:underline">
          Editar
        </button>
      ) : null}
    </div>
  );
}

/** Editor (janela): afixar, mudar ou tirar. */
export function PinnedNoteDialog({ lead, open, onOpenChange, initial }: { lead: Lead; open: boolean; onOpenChange: (open: boolean) => void; initial?: string }) {
  const update = useUpdateLead(lead.id);
  const [text, setText] = useState(initial ?? lead.pinned_note ?? '');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setText(initial ?? lead.pinned_note ?? '');
  }

  async function save(value: string | null) {
    try {
      await update.mutateAsync({ pinned_note: value });
      toast.success(value ? 'Nota afixada.' : 'Nota tirada.');
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nota afixada"
      description="Uma frase sempre à vista no topo da ficha e na Prospeção (ex.: “Só atende depois das 15h”)."
      className="max-w-md"
      footer={
        <>
          {lead.pinned_note ? (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => void save(null)} disabled={update.isPending}>
              <PinOff className="h-4 w-4" aria-hidden /> Tirar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="pinned-note" loading={update.isPending} disabled={!text.trim()}>
            <Pin className="h-4 w-4" aria-hidden /> Afixar
          </Button>
        </>
      }
    >
      <form
        id="pinned-note"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void save(text.trim().slice(0, 200));
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Ex.: Falar com a Marta, não com o sócio" aria-label="Nota afixada" />
        <p className="mt-1 text-right text-xs text-muted tabular">{text.length}/200</p>
      </form>
    </Dialog>
  );
}
