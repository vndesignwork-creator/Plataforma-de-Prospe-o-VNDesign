import { NextResponse } from 'next/server';
import { ApiError, apiRoute, json } from '@/server/http';
import { removeSignatureLogo, setSignatureLogo, signatureLogoSignedUrl } from '@/server/services/signature-logo';

/** GET /api/v1/signature/logo — o logótipo da assinatura (redireciona para um link temporário). */
export const GET = apiRoute(async (_req, ctx) => {
  const res = NextResponse.redirect(await signatureLogoSignedUrl(ctx), 302);
  // O endereço já leva a versão (?v=): o browser pode guardar a imagem uns minutos.
  res.headers.set('Cache-Control', 'private, max-age=600');
  return res;
});

/** POST /api/v1/signature/logo — logótipo novo (multipart, campo "file": PNG, JPEG ou GIF até 1 MB). */
export const POST = apiRoute(async (req, ctx) => {
  const form = await req.formData().catch(() => {
    throw new ApiError(422, 'Pedido inválido', 'Envia a imagem como multipart/form-data.');
  });
  const file = form.get('file');
  return json({ data: await setSignatureLogo(ctx, file instanceof File ? file : null) });
});

/** DELETE /api/v1/signature/logo — tirar o logótipo da assinatura. */
export const DELETE = apiRoute(async (_req, ctx) => json({ data: await removeSignatureLogo(ctx) }));
