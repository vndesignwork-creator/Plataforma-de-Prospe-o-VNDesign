import { publicContractPdf } from '@/server/services/contracts';

export const runtime = 'nodejs';

/** GET /api/v1/public/contracts/{código}/pdf — o contrato em PDF para o cliente (sem sessão). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const pdf = await publicContractPdf((await params).token);
  if (!pdf) return new Response('Contrato não encontrado.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(new Uint8Array(pdf.content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
