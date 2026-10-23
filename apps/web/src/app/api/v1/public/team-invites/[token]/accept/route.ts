import { TeamAcceptSchema } from '@vndesign/core';
import { ApiError, handleError, json } from '@/server/http';
import { acceptTeamInvite } from '@/server/services/team';

/** POST /api/v1/public/team-invites/{código}/accept — aceitar o convite da equipa criando a conta (nome + palavra-passe). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const parsed = TeamAcceptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, 'Dados inválidos', parsed.error.issues[0]?.message ?? 'Confirma o nome e a palavra-passe.');
    return json({ data: await acceptTeamInvite((await params).token, parsed.data) });
  } catch (error) {
    return handleError(error);
  }
}
