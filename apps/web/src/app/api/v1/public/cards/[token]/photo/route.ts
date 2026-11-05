import { NextResponse } from 'next/server';
import { publicCardImageUrl } from '@/server/services/business-card';

type Params = { params: Promise<{ token: string }> };

/** GET /api/v1/public/cards/{código}/photo — a foto do perfil (redireciona para um link temporário). */
export async function GET(_req: Request, { params }: Params) {
  const url = await publicCardImageUrl((await params).token, 'photo');
  if (!url) return new Response(null, { status: 404 });
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'public, max-age=600');
  return res;
}
