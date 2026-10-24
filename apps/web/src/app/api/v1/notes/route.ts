import { NoteSearchQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { searchNotes } from '@/server/services/note-search';

/** GET /api/v1/notes?q= — pesquisa rápida no texto das notas e chamadas registadas (Ctrl+K). */
export const GET = apiRoute(async (req, ctx) => json({ data: await searchNotes(ctx, parseQuery(req, NoteSearchQuerySchema)) }));
