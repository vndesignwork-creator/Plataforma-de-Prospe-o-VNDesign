import { apiRoute, json } from '@/server/http';
import { listAllCollaborators } from '@/server/services/collaborators';

/** GET /api/v1/collaborators — todos os colaboradores (por pessoa), com os projetos e as horas de cada um. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listAllCollaborators(ctx) }));
