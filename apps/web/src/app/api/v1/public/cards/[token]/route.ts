import { CardContactSchema } from '@vndesign/core';
import { NextResponse } from 'next/server';
import { submitCardContact } from '@/server/services/business-card';

type Params = { params: Promise<{ token: string }> };

/** POST /api/v1/public/cards/{código} — "Deixe o seu contacto" no cartão (sem login). */
export async function POST(req: Request, { params }: Params) {
  const body = await req.json().catch(() => null);
  const parsed = CardContactSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 422 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const result = await submitCardContact((await params).token, parsed.data, ip);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
