import { timingSafeEqual } from 'node:crypto';

/** Pedidos do cron: "Authorization: Bearer CRON_SECRET" (comparação em tempo constante). */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
