import { NextResponse } from 'next/server';
import { checkFreeAuditSite } from '@/server/services/free-audit';

export const runtime = 'nodejs';

/* GET /api/v1/public/free-audit/{código}/verificar-site?url=… — "o site abre?" antes de enviar (sem login). */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const url = new URL(req.url).searchParams.get('url') ?? '';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const result = await checkFreeAuditSite((await params).token, url, { ip }).catch(() => ({ ok: true, message: null }));
  if (!result) return NextResponse.json({ ok: false, message: 'Esta página não existe ou foi desligada.' }, { status: 404, headers: CORS });
  return NextResponse.json(result, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}
