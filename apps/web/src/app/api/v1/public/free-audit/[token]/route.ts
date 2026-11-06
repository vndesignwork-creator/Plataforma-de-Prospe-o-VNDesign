import { NextResponse } from 'next/server';
import { submitFreeAudit } from '@/server/services/free-audit';

export const runtime = 'nodejs';

/*
 * POST /api/v1/public/free-audit/{código} — pedido da análise grátis (sem login), da página
 * /analise/{código}. JSON ou formulário HTML normal.
 */
async function readFields(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  const form = await req.formData().catch(() => null);
  const out: Record<string, unknown> = {};
  form?.forEach((v, k) => {
    if (typeof v === 'string' && !(k in out)) out[k] = v;
  });
  return out;
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const result = await submitFreeAudit((await params).token, await readFields(req), { ip });
  return NextResponse.json(result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message, errors: result.errors ?? null }, { status: result.ok ? 200 : result.status });
}
