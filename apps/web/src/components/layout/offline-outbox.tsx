'use client';

/**
 * Sem rede: uma faixa no topo diz que o que se registar fica guardado neste aparelho e quantos
 * registos estão por enviar. Quando a rede volta, envia-os sozinho, pela ordem em que foram
 * feitos (e diz o que não foi aceite, ex.: um lead que entretanto foi apagado).
 */
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { ApiClientError, api, errorMessage } from '@/lib/api-client';
import { pendingFor, readOutbox, removeFromOutbox, setOutboxUser, subscribeOutbox, type OutboxItem } from '@/lib/outbox';
import { useMe } from '@/lib/queries';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

// O texto guardado (para o useSyncExternalStore comparar sem criar listas novas).
const snapshot = () => {
  try {
    return localStorage.getItem('vnd.outbox.v1') ?? '[]';
  } catch {
    return '[]';
  }
};

export function OfflineOutbox() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const userId = me?.user.id ?? null;
  useEffect(() => setOutboxUser(userId), [userId]);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const raw = useSyncExternalStore(subscribeOutbox, snapshot, () => '[]');
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  let pending: OutboxItem[] = [];
  try {
    pending = userId ? pendingFor(JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    pending = [];
  }

  const flush = useCallback(async () => {
    if (busy.current || !userId) return;
    const items = pendingFor(readOutbox());
    if (!items.length) return;
    busy.current = true;
    setSending(true);
    let sent = 0;
    const refused: string[] = [];
    try {
      for (const item of items) {
        try {
          await api(item.path, { method: item.method, body: item.body });
          sent++;
          removeFromOutbox(item.id);
        } catch (error) {
          if (error instanceof ApiClientError) {
            // O servidor recusou (ex.: o lead foi apagado): não fica para sempre na fila.
            refused.push(`${item.label}: ${errorMessage(error)}`);
            removeFromOutbox(item.id);
          } else {
            break; // Ainda sem rede: tenta outra vez mais tarde.
          }
        }
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
    if (sent) {
      toast.success(sent === 1 ? 'Enviado 1 registo feito sem rede.' : `Enviados ${sent} registos feitos sem rede.`);
      void qc.invalidateQueries();
    }
    for (const r of refused) toast.error(`Não ficou guardado — ${r}`, { duration: 15_000 });
  }, [qc, userId]);

  // Quando a rede volta, ao abrir e, enquanto houver algo por enviar, de 20 em 20 segundos.
  const count = pending.length;
  useEffect(() => {
    if (!online || !count) return;
    const t = window.setTimeout(() => void flush(), 300);
    return () => window.clearTimeout(t);
  }, [online, count, flush]);
  useEffect(() => {
    if (!count) return;
    const timer = window.setInterval(() => navigator.onLine && void flush(), 20_000);
    return () => window.clearInterval(timer);
  }, [count, flush]);

  if (online && !count) return null;
  return (
    <div
      role="status"
      aria-label="Sem rede"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm"
    >
      <CloudOff className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        {online ? (
          <>A enviar o que registaste sem rede…</>
        ) : (
          <>
            <strong className="font-semibold">Sem rede.</strong> O que registares nesta página (resultados da Prospeção, chamadas, estado, tarefas) fica guardado neste
            aparelho e é enviado quando a rede voltar.
          </>
        )}
        {count ? (
          <span className="ml-1 font-medium" data-testid="outbox-count">
            {count === 1 ? '1 registo por enviar.' : `${count} registos por enviar.`}
          </span>
        ) : null}
      </span>
      {online && count ? (
        <button type="button" onClick={() => void flush()} disabled={sending} className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline disabled:opacity-60">
          <RefreshCw className={sending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} aria-hidden /> Enviar agora
        </button>
      ) : null}
    </div>
  );
}
