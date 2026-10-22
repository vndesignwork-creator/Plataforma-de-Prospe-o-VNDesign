import { CollaboratorAcceptSchema } from '@vndesign/core';
import { ApiError, handleError, json } from '@/server/http';
import { acceptInvite } from '@/server/services/collaborators';

/** POST /api/v1/public/invites/{código}/accept — aceitar o convite criando a conta (nome + palavra-passe). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const parsed = CollaboratorAcceptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, 'Dados inválidos', parsed.error.issues[0]?.message ?? 'Confirma o nome e a palavra-passe.');
    return json({ data: await acceptInvite((await params).token, parsed.data) });
  } catch (error) {
    return handleError(error);
  }
}
