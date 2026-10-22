import { apiRoute, json, parseId } from '@/server/http';
import { findLeadContacts } from '@/server/services/contact-finder';

/** POST /api/v1/leads/{id}/find-contacts — procurar telefone e email no site, na página de contactos e no Google Maps (não guarda nada). */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await findLeadContacts(ctx, parseId(id)) }));
