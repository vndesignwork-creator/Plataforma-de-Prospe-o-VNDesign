import { publicOrigin } from '@/lib/public-url';
import { apiRoute, json } from '@/server/http';
import { sendWeeklyReportNow } from '@/server/services/weekly-report';

/** POST /api/v1/reports/weekly — envia já o resumo da semana (últimos 7 dias) a quem pede; dono e administradores. */
export const POST = apiRoute(async (req, ctx) => json({ data: await sendWeeklyReportNow(ctx, publicOrigin(req)) }));
