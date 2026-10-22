import { handleError, json } from '@/server/http';
import { submitBriefing } from '@/server/services/briefing';

/** POST /api/v1/public/briefings/{código} — o cliente envia o briefing (multipart: answer_0…, files). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const form = await req.formData();
    return json({ data: await submitBriefing((await params).token, form) });
  } catch (error) {
    return handleError(error);
  }
}
