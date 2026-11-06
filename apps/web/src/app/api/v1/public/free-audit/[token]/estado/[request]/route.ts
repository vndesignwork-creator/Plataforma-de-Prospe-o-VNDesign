import { NextResponse } from 'next/server';
import { freeAuditStatus } from '@/server/services/free-audit';

export const runtime = 'nodejs';

/* GET /api/v1/public/free-audit/{código}/estado/{pedido} — o resultado para mostrar no ecrã depois de enviar (sem login). */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; request: string }> }) {
  const { token, request } = await params;
  const status = await freeAuditStatus(token, decodeURIComponent(request)).catch(() => null);
  if (!status) return NextResponse.json({ ok: false, message: 'Pedido desconhecido.' }, { status: 404, headers: CORS });
  return NextResponse.json({ ok: true, ...status }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
