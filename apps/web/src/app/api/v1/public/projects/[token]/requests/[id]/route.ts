import { ApiError, handleError, json, parseId } from '@/server/http';
import { clientSendRequest } from '@/server/services/client-requests';

export const maxDuration = 120;

/**
 * POST /api/v1/public/projects/{código}/requests/{id} — na página do cliente (sem
 * sessão): enviar o que foi pedido (nota em "note" e ficheiros em "files", multipart).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const form = await req.formData().catch(() => {
      throw new ApiError(400, 'Pedido inválido');
    });
    return json({ data: await clientSendRequest(token, parseId(id, 'Pedido não encontrado'), form) });
  } catch (error) {
    return handleError(error);
  }
}
