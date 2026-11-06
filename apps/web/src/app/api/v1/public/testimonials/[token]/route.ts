import { TestimonialSubmitSchema } from '@vndesign/core';
import { handleError, json, parseJson } from '@/server/http';
import { submitTestimonial } from '@/server/services/testimonials';

/** POST /api/v1/public/testimonials/{código} — o cliente envia (ou corrige) o testemunho. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const input = await parseJson(req, TestimonialSubmitSchema);
    return json({ data: await submitTestimonial((await params).token, input) });
  } catch (error) {
    return handleError(error);
  }
}
