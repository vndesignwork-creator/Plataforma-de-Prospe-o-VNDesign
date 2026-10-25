import { NextResponse } from 'next/server';
import { apiRoute, parseId } from '@/server/http';
import { avatarSignedUrl } from '@/server/services/profile';

/** GET /api/v1/avatars/{userId} — a foto de alguém da equipa (redireciona para um link temporário). */
export const GET = apiRoute<{ userId: string }>(async (_req, ctx, { userId }) => {
  const res = NextResponse.redirect(await avatarSignedUrl(ctx, parseId(userId, 'Utilizador')), 302);
  // O endereço já leva a versão (?v=): o browser pode guardar a foto uns minutos.
  res.headers.set('Cache-Control', 'private, max-age=600');
  return res;
});
