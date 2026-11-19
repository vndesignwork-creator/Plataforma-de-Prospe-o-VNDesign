'use client';

/**
 * Comentários em cima da imagem de uma entrega: clica-se num ponto da imagem e
 * escreve-se ali o que mudar ("este botão maior"). Cada marca tem um número, e
 * a lista ao lado mostra os comentários — os teus e os do cliente (que os
 * escreve na página do projeto).
 */
import { formatDateTime, openPins, pinNumbers, type DeliverablePin, type Lead, type ProjectDeliverable } from '@vndesign/core';
import { Check, ImageUp, MessageSquarePlus, Trash2, Undo2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { errorMessage } from '@/lib/api-client';
import { useDeliverableImage, usePinAction, usePins } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Uma marca na imagem (o número e a cor dizem se já está resolvida). */
function PinDot({ pin, n, active, onClick }: { pin: DeliverablePin; n: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
      aria-label={`Comentário ${n}: ${pin.comment}`}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white text-xs font-bold shadow-md transition-transform',
        'flex h-6 w-6 items-center justify-center',
        pin.resolved_at ? 'bg-success text-white' : pin.author === 'cliente' ? 'bg-accent text-accent-fg' : 'bg-fg text-bg',
        active && 'scale-125 ring-2 ring-accent',
      )}
    >
      {n}
    </button>
  );
}

export function DeliverablePinsDialog({ lead, deliverable, onClose }: { lead: Lead; deliverable: ProjectDeliverable; onClose: () => void }) {
  const { data: pins } = usePins(deliverable.id);
  const action = usePinAction(lead.id, deliverable.id);
  const image = useDeliverableImage(lead.id, deliverable.id);
  const [draft, setDraft] = useState<{ x: number; y: number; comment: string } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const numbers = pinNumbers(pins ?? []);
  const open = openPins(pins ?? []);

  /** Clicar na imagem: marca nova nesse ponto (em % para servir em qualquer ecrã). */
  function place(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100));
    setActive(null);
    setDraft({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, comment: '' });
  }

  async function saveDraft() {
    if (!draft?.comment.trim()) return;
    try {
      await action.mutateAsync({ x: draft.x, y: draft.y, comment: draft.comment.trim() });
      setDraft(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function changeImage(file: File | undefined) {
    if (!file) return;
    try {
      await image.mutateAsync({ file });
      toast.success('Imagem guardada.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={deliverable.title}
      description={
        deliverable.image_name
          ? 'Clica num ponto da imagem para comentar. O cliente também pode comentar na página do projeto.'
          : 'Junta uma imagem da entrega para poderem comentar em cima dela.'
      }
      className="sm:max-w-5xl"
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-[2]">
          {deliverable.image_name ? (
            <div className="relative select-none overflow-hidden rounded-lg border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem com link temporário do servidor */}
              <img
                src={`/api/v1/deliverables/${deliverable.id}/image`}
                alt={`Entrega ${deliverable.title}`}
                className="block w-full"
                draggable={false}
              />
              {/* A camada das marcas fica por cima da imagem (o clique põe uma marca nova). */}
              <div className="absolute inset-0 cursor-crosshair" onClick={place} role="presentation" data-testid="camada-comentarios">
                {(pins ?? []).map((p) => (
                  <PinDot key={p.id} pin={p} n={numbers.get(p.id) ?? 0} active={active === p.id} onClick={() => setActive(p.id)} />
                ))}
                {draft ? (
                  <span
                    style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
                    className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent text-xs font-bold text-accent-fg shadow-md"
                    aria-hidden
                  >
                    +
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <ImageUp className="h-8 w-8 text-muted" aria-hidden />
              <p className="text-sm text-muted">Junta a maquete, o logótipo ou a página em imagem (PNG, JPG, WEBP ou GIF até 15 MB).</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void changeImage(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="outline" loading={image.isPending} onClick={() => fileInput.current?.click()}>
              <ImageUp className="h-3.5 w-3.5" aria-hidden /> {deliverable.image_name ? 'Trocar a imagem' : 'Juntar imagem'}
            </Button>
            {deliverable.image_name ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm('Tirar a imagem? Os comentários que estão em cima dela também saem.')) return;
                  image.mutate({ remove: true }, { onError: (e) => toast.error(errorMessage(e)) });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Tirar a imagem
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:max-w-xs">
          <p className="text-sm font-medium">
            Comentários {pins?.length ? <span className="text-muted">({open.length} por resolver de {pins.length})</span> : null}
          </p>
          {draft ? (
            <div className="rounded-lg border border-accent bg-accent-soft p-2">
              <Textarea
                autoFocus
                rows={3}
                value={draft.comment}
                maxLength={1000}
                onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                placeholder="Ex.: este botão maior e em laranja"
                aria-label="Comentário novo"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                </Button>
                <Button size="sm" loading={action.isPending} onClick={() => void saveDraft()} disabled={!draft.comment.trim()}>
                  <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Guardar
                </Button>
              </div>
            </div>
          ) : null}
          {pins?.length ? (
            <ul className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto" aria-label="Comentários na imagem">
              {pins.map((p) => (
                <li
                  key={p.id}
                  className={cn('rounded-lg border border-border p-2 text-sm', active === p.id && 'border-accent bg-accent-soft', p.resolved_at && 'opacity-60')}
                >
                  <button type="button" onClick={() => setActive(p.id)} className="flex w-full items-start gap-2 text-left">
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        p.resolved_at ? 'bg-success text-white' : p.author === 'cliente' ? 'bg-accent text-accent-fg' : 'bg-fg text-bg',
                      )}
                    >
                      {numbers.get(p.id)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words', p.resolved_at && 'line-through')}>{p.comment}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {p.author === 'cliente' ? `${p.author_name ?? 'Cliente'} (cliente)` : 'Eu'} · {formatDateTime(p.created_at)}
                      </span>
                    </span>
                  </button>
                  <div className="mt-1 flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => action.mutate({ id: p.id, patch: { resolved: !p.resolved_at } }, { onError: (e) => toast.error(errorMessage(e)) })}
                    >
                      {p.resolved_at ? (
                        <>
                          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Reabrir
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden /> Resolvido
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Apagar o comentário ${numbers.get(p.id)}`}
                      onClick={() => action.mutate({ remove: p.id }, { onError: (e) => toast.error(errorMessage(e)) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : deliverable.image_name ? (
            <p className="text-sm text-muted">Ainda não há comentários. Clica num ponto da imagem para escrever o primeiro.</p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
