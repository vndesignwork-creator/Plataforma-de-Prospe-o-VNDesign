import { apiRoute, json } from '@/server/http';
import { contactIssues } from '@/server/services/contact-issues';

export const runtime = 'nodejs';

/** GET /api/v1/leads/contact-issues — leads com o email ou o telefone por corrigir (voltou para trás, domínio sem email, dígitos a mais ou a menos, telefone repetido). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await contactIssues(ctx) }));
