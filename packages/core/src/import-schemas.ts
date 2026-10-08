/**
 * Schemas da API de importação (pré-visualização e confirmação).
 */
import { z } from 'zod';
import { IMPORT_FIELDS } from './import';
import { DuplicateMatchSchema, LeadCreateSchema } from './schemas';

export const MAX_IMPORT_ROWS = 5000;

export const ImportTargetSchema = z.enum([...IMPORT_FIELDS, 'ignore']).meta({ id: 'ImportTarget' });

export const ImportAnalysisSchema = z
  .object({
    source: z.enum(['csv', 'xlsx']),
    filename: z.string(),
    sheets: z.array(z.string()),
    sheet: z.string().nullable(),
    header_row: z.int().meta({ description: 'Índice (0 = primeira linha) do cabeçalho detetado' }),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())).meta({ description: 'Linhas de dados (depois do cabeçalho), como texto' }),
    suggested_mapping: z.array(ImportTargetSchema),
  })
  .meta({ id: 'ImportAnalysis' });
export type ImportAnalysis = z.infer<typeof ImportAnalysisSchema>;

export const ImportPreviewRequestSchema = z
  .object({
    rows: z.array(z.array(z.string().max(50_000))).max(MAX_IMPORT_ROWS),
    mapping: z.array(ImportTargetSchema),
  })
  .refine((v) => v.mapping.includes('company_name'), {
    error: 'Indica qual a coluna com o nome da empresa.',
    path: ['mapping'],
  })
  .meta({ id: 'ImportPreviewRequest' });

export const ImportActionSchema = z.enum(['create', 'merge', 'skip']);
export type ImportAction = z.infer<typeof ImportActionSchema>;

export const ImportPreviewRowSchema = z
  .object({
    index: z.int().meta({ description: 'Índice da linha no pedido' }),
    status: z.enum(['ok', 'invalid', 'empty']),
    lead: z.record(z.string(), z.unknown()).nullable(),
    number: z.int().nullable(),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    duplicates: z.array(DuplicateMatchSchema.pick({ lead_id: true, number: true, company_name: true, status: true, reasons: true, strength: true })),
    do_not_contact: z.array(z.object({ id: z.uuid(), company_name: z.string(), reason: z.string().nullable() })),
    in_file_duplicate_of: z.int().nullable(),
    suggested_action: ImportActionSchema,
    blocked: z.boolean(),
  })
  .meta({ id: 'ImportPreviewRow' });
export type ImportPreviewRow = z.infer<typeof ImportPreviewRowSchema>;

export const ImportPreviewSchema = z
  .object({
    rows: z.array(ImportPreviewRowSchema),
    summary: z.object({
      total: z.int(),
      create: z.int(),
      merge: z.int(),
      skip: z.int(),
      blocked: z.int(),
      invalid: z.int(),
      duplicates: z.int(),
    }),
  })
  .meta({ id: 'ImportPreview' });
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const ImportCommitSchema = z
  .object({
    filename: z.string().max(255).optional(),
    source: z.enum(['csv', 'xlsx']).default('csv'),
    keep_numbers: z.boolean().default(true).meta({ description: 'Manter o "#" da folha quando estiver livre' }),
    items: z
      .array(
        z.object({
          index: z.int().min(0),
          action: ImportActionSchema,
          target_id: z.uuid().nullish(),
          number: z.int().min(1).nullish(),
          lead: LeadCreateSchema,
        }),
      )
      .max(MAX_IMPORT_ROWS),
  })
  .meta({ id: 'ImportCommit' });
export type ImportCommit = z.infer<typeof ImportCommitSchema>;

export const ImportResultItemSchema = z.object({
  index: z.int(),
  result: z.enum(['created', 'merged', 'skipped', 'blocked']),
  lead_id: z.uuid().nullable(),
  number: z.int().nullable(),
  company_name: z.string(),
});

export const ImportJobSchema = z
  .object({
    id: z.uuid(),
    source: z.enum(['csv', 'xlsx', 'api']),
    filename: z.string().nullable(),
    stats: z.object({ created: z.int(), merged: z.int(), skipped: z.int(), blocked: z.int() }),
    report: z.array(ImportResultItemSchema),
    created_at: z.string(),
  })
  .meta({ id: 'ImportJob' });
export type ImportJob = z.infer<typeof ImportJobSchema>;
