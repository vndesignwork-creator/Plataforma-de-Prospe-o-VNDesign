/**
 * Utilitários HTTP da API /api/v1: erros no formato problem+json (RFC 9457),
 * validação com Zod e um "wrapper" que trata autenticação e erros.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { ApiTokenScope } from '@vndesign/core';
import { z } from 'zod';
import { getApiContext, type ApiContext } from './context';

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
  }
}

export function problemResponse(
  status: number,
  title: string,
  detail?: string,
  extra?: Record<string, unknown>,
): Response {
  return NextResponse.json(
    { type: 'about:blank', title, status, ...(detail ? { detail } : {}), ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

/** Erros de validação Zod → { campo: [mensagens] } */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

export function validationError(error: z.ZodError): ApiError {
  return new ApiError(400, 'Pedido inválido', 'Alguns campos não são válidos.', {
    errors: zodFieldErrors(error),
  });
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'Pedido inválido', 'O corpo do pedido não é JSON válido.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function parseQuery<T extends z.ZodType>(req: Request, schema: T): z.output<T> {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function parseId(value: string, what = 'Lead'): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError(404, `${what} não encontrado`);
  return parsed.data;
}

/** Converte erros do PostgREST/Postgres em erros HTTP com mensagens em pt-PT. */
export function fromPostgrest(error: PostgrestError, notFound = 'Registo não encontrado'): ApiError {
  switch (error.code) {
    case 'PGRST116':
    case 'P0002':
      return new ApiError(404, notFound, error.code === 'P0002' ? error.message : undefined);
    case '22023':
    case '22P02':
    case '23514':
    case '23502':
      return new ApiError(400, 'Pedido inválido', error.message);
    case '23503':
      return new ApiError(400, 'Referência inválida', 'Um dos registos indicados não existe neste workspace.');
    case '23505':
      return new ApiError(409, 'Já existe', 'Já existe um registo com estes dados.');
    case '42501':
      return new ApiError(403, 'Sem permissão', 'Não tens permissão para esta operação.');
    // Tabela, coluna ou função que a base de dados ainda não tem: a versão nova da
    // plataforma foi publicada antes de aplicar as migrações (npx supabase db push).
    case 'PGRST202':
    case 'PGRST204':
    case 'PGRST205':
    case '42P01':
    case '42703':
    case '42883':
      console.error('[api] base de dados por atualizar', error);
      return new ApiError(
        503,
        'Base de dados por atualizar',
        'Esta funcionalidade precisa de uma atualização da base de dados. No computador: git pull e depois npx supabase db push.',
      );
    default:
      console.error('[api] erro do Postgres', error);
      return new ApiError(500, 'Erro interno', 'Ocorreu um erro inesperado. Tenta novamente.');
  }
}

/** Lança se houver erro; devolve os dados (não nulos) caso contrário. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }, notFound?: string): T {
  if (result.error) throw fromPostgrest(result.error, notFound);
  if (result.data === null) throw new ApiError(404, notFound ?? 'Registo não encontrado');
  return result.data;
}

type RouteParams = Record<string, string>;
type Handler<P extends RouteParams> = (req: Request, ctx: ApiContext, params: P) => Promise<Response>;

export interface ApiRouteOptions {
  /**
   * Aceita tokens de integração com este scope. Sem esta opção, a rota só
   * aceita a sessão da web ou o access token Supabase da app.
   */
  token?: ApiTokenScope;
}

/** Garante que o pedido com token de integração tem o scope necessário. */
export function assertTokenScope(ctx: ApiContext, scope: ApiTokenScope | undefined) {
  if (ctx.authMethod !== 'token') return;
  if (!scope) {
    throw new ApiError(403, 'Não disponível com token', 'Este endpoint não aceita tokens de integração.');
  }
  if (!ctx.token?.scopes.includes(scope)) {
    throw new ApiError(403, 'Sem permissão', `O token não tem a permissão "${scope}".`);
  }
}

/**
 * Envolve um route handler: autentica (sessão, Bearer ou token de integração),
 * resolve o workspace e converte exceções em respostas problem+json.
 */
export function apiRoute<P extends RouteParams = RouteParams>(handler: Handler<P>, options: ApiRouteOptions = {}) {
  return async (req: Request, segment: { params: Promise<P> }): Promise<Response> => {
    try {
      const ctx = await getApiContext(req);
      assertTokenScope(ctx, options.token);
      const params = await segment.params;
      return await handler(req, ctx, params);
    } catch (error) {
      return handleError(error);
    }
  };
}

export function handleError(error: unknown): Response {
  if (error instanceof ApiError) {
    return problemResponse(error.status, error.title, error.detail, error.extra);
  }
  console.error('[api] erro inesperado', error);
  return problemResponse(500, 'Erro interno', 'Ocorreu um erro inesperado. Tenta novamente.');
}

export function json(data: unknown, init?: ResponseInit): Response {
  return NextResponse.json(data, init);
}
