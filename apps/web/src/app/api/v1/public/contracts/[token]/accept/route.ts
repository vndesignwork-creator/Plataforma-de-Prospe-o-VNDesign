import { ContractAcceptSchema } from '@vndesign/core';
import { ApiError, handleError, json } from '@/server/http';
import { acceptContract } from '@/server/services/contracts';

/** POST /api/v1/public/contracts/{código}/accept — o cliente aceita o contrato (nome + confirmação). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const parsed = ContractAcceptSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, 'Dados inválidos', parsed.error.issues[0]?.message ?? 'Confirma o nome e a aceitação.');
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const contract = await acceptContract((await params).token, parsed.data.name, ip);
    return json({ data: { status: contract.status, accepted_at: contract.accepted_at, accepted_name: contract.accepted_name } });
  } catch (error) {
    return handleError(error);
  }
}
