import { freeAuditExamplePdf } from '@/server/services/free-audit';

export const runtime = 'nodejs';

/* GET /api/v1/public/free-audit/{código}/exemplo — o relatório de exemplo em PDF (dados fictícios). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const pdf = await freeAuditExamplePdf((await params).token);
  if (!pdf) return new Response('Esta página não existe ou foi desligada.', { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Exemplo-relatorio-do-site.pdf"',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
