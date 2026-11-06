import { TestimonialUpdateSchema } from "@vndesign/core";
import { apiRoute, json, parseId, parseJson } from "@/server/http";
import {
  deleteTestimonialById,
  updateTestimonial,
} from "@/server/services/testimonials";

/** PATCH /api/v1/testimonials/{id} — mostrar ou não nas propostas. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) =>
  json({
    data: await updateTestimonial(
      ctx,
      parseId(id, "Testemunho não encontrado"),
      await parseJson(req, TestimonialUpdateSchema),
    ),
  }),
);

/** DELETE /api/v1/testimonials/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteTestimonialById(ctx, parseId(id, "Testemunho não encontrado"));
  return new Response(null, { status: 204 });
});
