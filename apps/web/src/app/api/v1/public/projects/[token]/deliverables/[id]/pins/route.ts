import { PublicPinCreateSchema } from '@vndesign/core';
import { handleError, json, parseId, validationError } from '@/server/http';
import { createSharedPin } from '@/server/services/project-tools';

/**
 * POST /api/v1/public/projects/{código}/deliverables/{id}/pins — na página do
 * cliente (sem sessão): comentar num ponto da imagem.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const parsed = PublicPinCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw validationError(parsed.error);
    return json({ data: await createSharedPin(token, parseId(id, 'Imagem não encontrada'), parsed.data) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
