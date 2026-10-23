import { NextResponse } from 'next/server';
import { submitSiteForm } from '@/server/services/site-form';

/*
 * POST /api/v1/public/forms/{código} — formulário do site (sem login).
 * Aceita JSON, multipart ou application/x-www-form-urlencoded (formulário HTML
 * normal, Bricks "Webhook", Contact Form 7…). Responde em JSON a quem pede JSON;
 * a um formulário HTML normal, volta para `_next` (se vier) ou mostra "Obrigado".
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function readFields(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // Bricks/Zapier às vezes enviam { fields: {...} } ou { data: {...} }.
    const flat = (body?.fields ?? body?.data ?? body ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  }
  const form = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  form?.forEach((v, k) => {
    if (typeof v === 'string' && !(k in out)) out[k] = v;
  });
  return out;
}

const safeNext = (v: string | undefined) => (v && /^https?:\/\/[^\s]+$/i.test(v) ? v : null);

const page = (message: string) =>
  `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedido enviado</title>` +
  `<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f2ed;color:#0d0d0d}main{max-width:28rem;padding:2rem;text-align:center}a{color:#ef5c32}</style></head>` +
  `<body><main><p>${message.replace(/</g, '&lt;')}</p><p><a href="javascript:history.back()">Voltar</a></p></main></body></html>`;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const fields = await readFields(req);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const result = await submitSiteForm((await params).token, fields, { ip, referer: req.headers.get('referer') });
  const wantsJson = (req.headers.get('accept') ?? '').includes('application/json') || (req.headers.get('content-type') ?? '').includes('application/json');
  if (wantsJson) {
    return NextResponse.json({ ok: result.ok, message: result.message }, { status: result.ok ? 200 : result.status, headers: CORS });
  }
  const next = safeNext(fields._next);
  if (result.ok && next) return NextResponse.redirect(next, { status: 303, headers: CORS });
  return new Response(page(result.message), { status: result.ok ? 200 : result.status, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' } });
}
