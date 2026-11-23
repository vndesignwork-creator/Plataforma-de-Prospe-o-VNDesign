import { apiRoute, json, parseId } from '@/server/http';
import { getReferrals, markReferralAsked } from '@/server/services/referrals';

type Params = { id: string };

/** GET /api/v1/leads/{id}/referrals — quem este cliente indicou e quando lhe pedimos. */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getReferrals(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/referrals — "Já pedi" (fica na linha do tempo). */
export const POST = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await markReferralAsked(ctx, parseId(id)) }));
