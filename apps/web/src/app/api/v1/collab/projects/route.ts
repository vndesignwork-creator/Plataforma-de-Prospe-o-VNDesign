import { json } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { listCollabProjects } from '@/server/services/collaborators';

/** GET /api/v1/collab/projects — projetos em que o utilizador colabora. */
export const GET = collabRoute(async (_req, user) => json({ data: await listCollabProjects(user) }));
