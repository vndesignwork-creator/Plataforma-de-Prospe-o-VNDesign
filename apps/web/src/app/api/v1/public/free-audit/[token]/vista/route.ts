import { countFreeAuditView } from '@/server/services/free-audit';

export const runtime = 'nodejs';

/*
 * POST /api/v1/public/free-audit/{código}/vista — alguém viu o formulário (plugin de WordPress
 * ou página /analise), uma vez por dia por pessoa. Corpo: {"page": "<endereço da página>"},
 * enviado com navigator.sendBeacon (texto simples, sem pedido prévio de CORS).
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const text = (await req.text().catch(() => '')).slice(0, 2000);
  let page: unknown = null;
  try {
    page = (JSON.parse(text) as { page?: unknown } | null)?.page ?? null;
  } catch {
    // corpo inválido: não conta
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  await countFreeAuditView((await params).token, page, ip).catch((e) => console.warn('[análise grátis] vista', e instanceof Error ? e.message : e));
  return new Response(null, { status: 204, headers: CORS });
}
