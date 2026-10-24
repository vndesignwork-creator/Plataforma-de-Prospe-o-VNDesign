/**
 * Reciclagem: os leads apagados ficam 30 dias com tudo (tarefas, pagamentos,
 * reuniões, horas, propostas, linha do tempo…) e podem ser repostos.
 * Anonimizar (RGPD) e "apagar e não contactar" continuam definitivos.
 */
import { z } from 'zod';
import { LeadStatusSchema } from './schemas';

export const TRASH_DAYS = 30;

export const TrashItemSchema = z
  .object({
    id: z.uuid(),
    lead_id: z.uuid(),
    number: z.int(),
    company_name: z.string(),
    status: LeadStatusSchema,
    deleted_at: z.string(),
    deleted_by: z.uuid().nullable(),
    /** Quantas coisas guardadas (tarefas, pagamentos, registos na linha do tempo…). */
    items: z.int(),
    purge_on: z.string().meta({ description: 'Dia (AAAA-MM-DD) em que se apaga de vez' }),
  })
  .meta({ id: 'TrashItem' });
export type TrashItem = z.infer<typeof TrashItemSchema>;

export const TrashIdsSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(200) })
  .meta({ id: 'TrashIds' });

/** Caminhos dos ficheiros guardados no Storage (kit da marca e briefing) para apagar de vez. */
export function trashFilePaths(snapshot: unknown): { bucket: string; path: string }[] {
  const children = ((snapshot as { children?: Record<string, unknown[]> } | null)?.children ?? {}) as Record<string, { files?: unknown }[]>;
  const out: { bucket: string; path: string }[] = [];
  const collect = (rows: { files?: unknown }[] | undefined, bucket: string) => {
    for (const row of rows ?? []) {
      for (const f of Array.isArray(row.files) ? row.files : []) {
        const path = (f as { path?: unknown }).path;
        if (typeof path === 'string' && path) out.push({ bucket, path });
      }
    }
  };
  collect(children.lead_brand_kits, 'brand-kits');
  collect(children.project_briefings, 'project-files');
  return out;
}
