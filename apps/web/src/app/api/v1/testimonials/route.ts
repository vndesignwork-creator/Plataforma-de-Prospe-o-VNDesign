import { apiRoute, json } from '@/server/http';
import { listTestimonials } from '@/server/services/testimonials';

/** GET /api/v1/testimonials — todos os testemunhos (recebidos e pedidos). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listTestimonials(ctx) }));
