'use client';

/**
 * Definições → Assinatura → Cartão de contacto: o link e o QR para mostrar em
 * reuniões e feiras. Os dados vêm da assinatura (e a foto, do perfil).
 */
import { BUSINESS_CARD_BIO_MAX, type BusinessCard } from '@vndesign/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, Eye, RefreshCw, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardHeader, Skeleton } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api-client';

const KEY = ['business-card'];

export function BusinessCardSettings() {
  const qc = useQueryClient();
  const { data: card, isLoading } = useQuery({ queryKey: KEY, queryFn: () => api<{ data: BusinessCard }>('/business-card').then((r) => r.data) });
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- o texto começa com o que está guardado */
    setBio(card?.bio ?? '');
  }, [card?.bio]);

  async function patch(body: Record<string, unknown>, done?: string) {
    setSaving(true);
    try {
      const { data } = await api<{ data: BusinessCard }>('/business-card', { method: 'PATCH', body });
      qc.setQueryData(KEY, data);
      if (done) toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!card?.url) return;
    try {
      await navigator.clipboard.writeText(card.url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar. Seleciona o link e usa Ctrl+C.');
    }
  }

  async function share() {
    if (!card?.url) return;
    if (navigator.share) await navigator.share({ title: 'O meu cartão de contacto', url: card.url }).catch(() => undefined);
    else await copy();
  }

  const qrHref = card?.qr_svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.qr_svg)}` : null;
  const active = !!card?.token && card.enabled;

  return (
    <Card id="cartao">
      <CardHeader
        title="Cartão de contacto"
        description="Um link e um código QR com o teu nome, contactos e portefólio (os da assinatura). Quem o abre guarda o teu contacto ou deixa o dele — e fica lead."
      />
      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !active ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">{card?.token ? 'O cartão está desligado: o link não abre.' : 'Ainda não tens cartão.'}</p>
            <Button onClick={() => void patch({ enabled: true }, 'Cartão ligado.')} loading={saving}>
              {card?.token ? 'Ligar o cartão' : 'Criar o meu cartão'}
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Link</span>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{card.url}</span>
                  <button type="button" onClick={() => void copy()} className="shrink-0 rounded p-1 text-muted hover:bg-surface-3 hover:text-fg" aria-label="Copiar o link" title="Copiar o link">
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <a href={card.url!} target="_blank" rel="noreferrer" className={buttonClasses('outline', 'sm')}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver o cartão
                  </a>
                  <Button size="sm" variant="outline" onClick={() => void share()}>
                    <Share2 className="h-3.5 w-3.5" aria-hidden /> Partilhar
                  </Button>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Eye className="h-3.5 w-3.5" aria-hidden /> Aberto {card.views} {card.views === 1 ? 'vez' : 'vezes'}
                </p>
              </div>
              <Field label="Frase de apresentação (opcional)" hint={`${bio.length}/${BUSINESS_CARD_BIO_MAX} · ex.: “Faço sites rápidos para pequenos negócios na Grande Lisboa.”`}>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, BUSINESS_CARD_BIO_MAX))} rows={2} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void patch({ bio }, 'Cartão guardado.')} loading={saving} disabled={bio === (card.bio ?? '')}>
                  Guardar a frase
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm('Trocar o link? O link e o QR antigos deixam de funcionar.')) void patch({ rotate: true }, 'Link novo criado.');
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Trocar o link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void patch({ enabled: false }, 'Cartão desligado.')}>
                  Desligar
                </Button>
              </div>
            </div>
            {qrHref ? (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no servidor (SVG) */}
                <img src={qrHref} alt="Código QR do cartão de contacto" className="h-44 w-44 rounded-lg border border-border bg-white p-2" />
                <a href={qrHref} download="cartao-qr.svg" className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline">
                  <Download className="h-3.5 w-3.5" aria-hidden /> Descarregar o QR
                </a>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
