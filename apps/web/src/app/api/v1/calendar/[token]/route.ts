import { publicOrigin } from '@/lib/public-url';
import { calendarFeedIcs } from '@/server/services/calendar-feed';

/**
 * GET /api/v1/calendar/{código}.ics — o calendário subscrito (sem sessão: o
 * código secreto é a autorização). Usado pelo Google Calendar, iPhone e Outlook.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, '');
  const ics = await calendarFeedIcs(token, publicOrigin(req));
  if (!ics) return new Response('Calendário não encontrado.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="vndesign-leads.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
