import { PASSWORD_RESET_REPLY } from '@vndesign/core';
import { NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/public-url';
import { sendPasswordReset } from '@/server/services/password-reset';

/**
 * POST /api/v1/public/password-reset — "Esqueci-me da palavra-passe" (sem
 * sessão). Responde sempre o mesmo, exista ou não conta com aquele email.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: { title: 'Email inválido', detail: 'Indica um email válido.' } }, { status: 422 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const result = await sendPasswordReset(email, publicOrigin(request), ip);
  if (!result.ok) {
    const tooMany = result.status === 429;
    return NextResponse.json(
      {
        error: {
          title: tooMany ? 'Demasiados pedidos' : 'Não foi possível enviar',
          detail: tooMany ? 'Já pediste há pouco. Tenta daqui a 15 minutos.' : 'Tenta novamente daqui a pouco.',
        },
      },
      { status: result.status },
    );
  }
  return NextResponse.json({ data: { message: PASSWORD_RESET_REPLY } });
}
