import { handleError, parseId } from '@/server/http';
import { sharedDeliverableImageUrl } from '@/server/services/project-tools';

/** GET /api/v1/public/projects/{código}/deliverables/{id}/image — a imagem, na página do cliente. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    return Response.redirect(await sharedDeliverableImageUrl(token, parseId(id, 'Imagem não encontrada')), 307);
  } catch (error) {
    return handleError(error);
  }
}
