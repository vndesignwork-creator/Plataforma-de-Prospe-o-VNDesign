import { NextResponse } from 'next/server';
import { freeAuditPage, submitFreeAudit, type FreeAuditResult } from '@/server/services/free-audit';

export const runtime = 'nodejs';

/*
 * /api/v1/public/free-audit/{código} — "Analisar o meu site grátis" (sem login).
 * POST: o pedido, da página /analise/{código} ou do plugin de WordPress (o formulário é
 * enviado do browser do visitante, por isso aceita pedidos de outros sites). JSON ou
 * formulário HTML normal (sem JavaScript: volta para `_next` ou mostra "Obrigado").
 * GET: para o plugin confirmar que o código está certo e a página ligada.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

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

const safeNext = (v: unknown) => (typeof v === 'string' && /^https?:\/\/[^\s<>"]+$/i.test(v) ? v : null);

const page = (message: string) =>
  `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Análise do site</title>` +
  `<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f2ed;color:#0d0d0d}main{max-width:28rem;padding:2rem;text-align:center}a{color:#ef5c32}</style></head>` +
  `<body><main><p>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p><p><a href="javascript:history.back()">Voltar</a></p></main></body></html>`;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const info = await freeAuditPage((await params).token);
  if (!info) return NextResponse.json({ ok: false, message: 'Esta página não existe ou foi desligada.' }, { status: 404, headers: CORS });
  return NextResponse.json({ ok: true, company: info.company }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const fields = await readFields(req);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  let result: FreeAuditResult;
  try {
    result = await submitFreeAudit((await params).token, fields, { ip });
  } catch (error) {
    // Com os cabeçalhos CORS, para o plugin mostrar a mensagem (e não "Sem ligação").
    console.error('[análise grátis] pedido', error);
    result = { ok: false, status: 500, message: 'Não foi possível enviar o pedido. Tente outra vez daqui a pouco.' };
  }
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json') || (req.headers.get('content-type') ?? '').includes('application/json');
  if (wantsJson) {
    return NextResponse.json(result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message, errors: result.errors ?? null }, { status: result.ok ? 200 : result.status, headers: CORS });
  }
  const next = safeNext(fields._next);
  if (result.ok && next) return NextResponse.redirect(next, { status: 303, headers: CORS });
  const detail = !result.ok && result.errors ? ` ${Object.values(result.errors).flat().join(' ')}` : '';
  return new Response(page(result.message + detail), { status: result.ok ? 200 : result.status, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' } });
}
