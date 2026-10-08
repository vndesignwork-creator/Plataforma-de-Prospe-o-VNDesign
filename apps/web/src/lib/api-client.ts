/**
 * Cliente da API /api/v1 para o browser. A web usa a mesma API que a app
 * móvel e as integrações vão usar.
 */
import type { Problem } from '@vndesign/core';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public problem: Problem & Record<string, unknown>,
  ) {
    super(problem.detail ?? problem.title);
  }
  /** Primeira mensagem de erro de um campo (validação Zod no servidor). */
  fieldError(field: string): string | undefined {
    return this.problem.errors?.[field]?.[0];
  }
}

type QueryValue = string | number | boolean | string[] | null | undefined;

export function toQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, QueryValue>; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`/api/v1${path}${toQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
    signal: options.signal,
  });
  if (res.status === 204) return undefined as T;
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      // Sessão expirada: recarregamento completo para limpar o estado da aplicação.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiClientError(
      res.status,
      payload ?? { type: 'about:blank', title: 'Erro de comunicação', status: res.status },
    );
  }
  return payload as T;
}

/** Mensagem legível para mostrar ao utilizador. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.problem.detail ?? error.problem.title;
  if (error instanceof Error && error.name !== 'AbortError') return 'Sem ligação ao servidor. Tenta novamente.';
  return 'Ocorreu um erro inesperado.';
}
