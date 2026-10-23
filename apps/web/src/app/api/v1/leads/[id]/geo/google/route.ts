import { apiRoute, json, parseId } from '@/server/http';
import { checkGoogleProfile } from '@/server/services/geo-kit';

// A pesquisa pela IA pode demorar (sem a chave da Google Places API).
export const maxDuration = 300;
type Params = { id: string };

/** POST /api/v1/leads/{id}/geo/google — nota e avaliações no Google do lead e dos concorrentes. */
export const POST = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await checkGoogleProfile(ctx, parseId(id)) }));
