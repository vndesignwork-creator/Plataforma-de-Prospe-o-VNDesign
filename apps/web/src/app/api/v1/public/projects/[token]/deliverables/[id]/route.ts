import { ClientDeliverableActionSchema } from '@vndesign/core';
import { handleError, json, parseId, validationError } from '@/server/http';
import { clientDeliverableAction } from '@/server/services/project-tools';

/**
 * POST /api/v1/public/projects/{código}/deliverables/{id} — na página do
 * cliente (sem sessão): aprovar a entrega ou pedir alterações (com comentário).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const parsed = ClientDeliverableActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw validationError(parsed.error);
    return json({ data: await clientDeliverableAction(token, parseId(id, 'Entrega não encontrada'), parsed.data) });
  } catch (error) {
    return handleError(error);
  }
}
