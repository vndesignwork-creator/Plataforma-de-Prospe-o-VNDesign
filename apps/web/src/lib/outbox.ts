/**
 * Trabalhar sem rede (telemóvel numa visita, zona sem rede): o que se regista na página que
 * já está aberta — resultado da Prospeção, chamada, mudança de estado, tarefa nova ou
 * concluída — fica guardado neste aparelho e é enviado sozinho, pela mesma ordem, quando a
 * rede volta. Só os pedidos marcados com `offline` (api()) entram aqui.
 */
import { toast } from 'sonner';

export interface OutboxItem {
  id: string;
  path: string;
  method: string;
  body?: unknown;
  /** O que foi feito, para mostrar ("Chamada · #12 Café Central"). */
  label: string;
  at: string;
  /** De quem é (noutra conta no mesmo telemóvel não se envia). */
  userId: string | null;
}

const KEY = 'vnd.outbox.v1';
const EVENT = 'vnd:outbox';

/** O pedido ficou guardado para enviar depois (não é um erro para mostrar). */
export class QueuedOffline extends Error {
  constructor(public item: OutboxItem) {
    super('Sem rede: ficou guardado neste aparelho e é enviado quando a rede voltar.');
    this.name = 'QueuedOffline';
  }
}
export const isQueuedOffline = (e: unknown): e is QueuedOffline => e instanceof QueuedOffline;

let currentUser: string | null = null;
/** Quem está com sessão iniciada (o AppShell diz). */
export function setOutboxUser(id: string | null) {
  currentUser = id;
}

export function readOutbox(): OutboxItem[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeOutbox(list: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sem armazenamento (modo privado): não há fila.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function enqueue(input: Omit<OutboxItem, 'id' | 'at' | 'userId'>): OutboxItem {
  const item: OutboxItem = {
    ...input,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    at: new Date().toISOString(),
    userId: currentUser,
  };
  writeOutbox([...readOutbox(), item]);
  return item;
}

/** Os por enviar desta pessoa. */
export function pendingFor(list: OutboxItem[] = readOutbox()): OutboxItem[] {
  return list.filter((i) => !i.userId || !currentUser || i.userId === currentUser);
}

export function removeFromOutbox(id: string) {
  writeOutbox(readOutbox().filter((i) => i.id !== id));
}

export function subscribeOutbox(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Falhou por falta de rede (e não por o servidor ter recusado)? */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === 'AbortError') return false;
  return error instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/** O aviso de que ficou guardado (um de cada vez, mesmo com vários registos seguidos). */
export function announceQueued() {
  toast('📴 Sem rede: ficou guardado neste aparelho e é enviado quando a rede voltar.', { id: 'outbox-queued' });
}
