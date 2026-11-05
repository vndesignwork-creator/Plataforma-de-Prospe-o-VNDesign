import { buildCardVCard } from '@vndesign/core';
import { getPublicCard } from '@/server/services/business-card';

type Params = { params: Promise<{ token: string }> };

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'contacto';

/** GET /api/v1/public/cards/{código}/vcard — "Guardar contacto" (ficheiro .vcf). */
export async function GET(_req: Request, { params }: Params) {
  const card = await getPublicCard((await params).token);
  if (!card) return new Response('Cartão desconhecido.', { status: 404 });
  return new Response(buildCardVCard(card), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug(card.full_name)}.vcf"`,
      'Cache-Control': 'no-store',
    },
  });
}
