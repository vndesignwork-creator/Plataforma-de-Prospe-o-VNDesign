import { apiRoute, json, parseId } from '@/server/http';
import { deleteTestimonial, getTestimonial, requestTestimonial } from '@/server/services/testimonials';

/** GET /api/v1/leads/{id}/testimonial — o testemunho do cliente (null se ainda não foi pedido). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getTestimonial(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/testimonial — criar o link do testemunho (/o/{token}); se já existe, devolve-o. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await requestTestimonial(ctx, parseId(id)) }, { status: 201 }));

/** DELETE /api/v1/leads/{id}/testimonial — apagar (o link deixa de funcionar). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteTestimonial(ctx, parseId(id));
  return new Response(null, { status: 204 });
});
