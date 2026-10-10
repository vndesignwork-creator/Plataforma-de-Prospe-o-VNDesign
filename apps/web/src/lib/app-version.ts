/**
 * Versão da plataforma e estado do servidor — para avisar quando foi publicada uma
 * versão nova ou quando a Hostinger está a publicar (o servidor fica uns segundos em baixo).
 */

/** A versão que este separador tem aberta (fixada no build). */
export const CLIENT_BUILD: string | null = process.env.NEXT_PUBLIC_BUILD_ID ?? null;

export type ServerState = { status: 'ok'; build: string | null } | { status: 'down' } | { status: 'offline' };

/** Pergunta ao servidor que versão está publicada (sem rede: "offline"; erro 5xx ou sem resposta: "down"). */
export async function checkServer(timeoutMs = 8000): Promise<ServerState> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/version', { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return { status: 'down' };
    const body = (await res.json()) as { build?: string | null };
    return { status: 'ok', build: body.build ?? null };
  } catch {
    return { status: 'down' };
  } finally {
    clearTimeout(timer);
  }
}

/** Erros típicos de um separador antigo depois de uma publicação (ficheiros que já não existem) ou do servidor em baixo. */
export function isUpdateError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to fetch|NetworkError|Load failed|fetch failed|Failed to load/i.test(
    text,
  );
}
