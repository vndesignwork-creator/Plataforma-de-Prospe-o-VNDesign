/**
 * Importação de leads a partir de CSV/XLSX (por exemplo, a folha atual
 * exportada do Google Sheets). Três passos:
 *   1. analyzeFile   — lê o ficheiro, deteta o cabeçalho e sugere o mapeamento;
 *   2. previewImport — converte as linhas, valida e procura duplicados;
 *   3. commitImport  — grava (de forma atómica) e guarda o relatório.
 */
import {
  MAX_IMPORT_ROWS,
  detectHeaderRow,
  findBatchDuplicates,
  isEmptyRow,
  mapImportRow,
  suggestMapping,
  type ImportAnalysis,
  type ImportCommit,
  type ImportJob,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportTarget,
} from '@vndesign/core';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { listSectors } from './sectors';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// -----------------------------------------------------------------------------
// 1. Ler o ficheiro
// -----------------------------------------------------------------------------

/** Converte o valor de uma célula do Excel em texto. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('hyperlink' in value) {
      const text = typeof value.text === 'string' ? value.text : cellToText(value.text as ExcelJS.CellValue);
      return text || value.hyperlink;
    }
    if ('result' in value) return cellToText(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
  }
  return String(value);
}

function worksheetRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  const width = ws.actualColumnCount || ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellToText(row.getCell(c).value).trim());
    rows[rowNumber - 1] = cells;
  });
  return Array.from(rows, (r) => r ?? []);
}

function headerScore(rows: string[][]): number {
  const i = detectHeaderRow(rows);
  return new Set(suggestMapping(rows[i] ?? []).filter((m) => m !== 'ignore')).size;
}

function buildAnalysis(
  source: 'csv' | 'xlsx',
  filename: string,
  sheets: string[],
  sheet: string | null,
  allRows: string[][],
): ImportAnalysis {
  const headerRow = detectHeaderRow(allRows);
  const rawHeaders = allRows[headerRow] ?? [];
  let data = allRows.slice(headerRow + 1);
  // Remove linhas vazias no fim.
  while (data.length && isEmptyRow(data[data.length - 1]!)) data.pop();
  const width = Math.max(rawHeaders.length, ...data.slice(0, 200).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => rawHeaders[i]?.trim() || `Coluna ${i + 1}`);
  if (data.length > MAX_IMPORT_ROWS) {
    throw new ApiError(413, 'Ficheiro demasiado grande', `Máximo de ${MAX_IMPORT_ROWS} linhas por importação.`);
  }
  data = data.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return {
    source,
    filename,
    sheets,
    sheet,
    header_row: headerRow,
    headers,
    rows: data,
    suggested_mapping: suggestMapping(rawHeaders.concat(Array(Math.max(0, width - rawHeaders.length)).fill(''))),
  };
}

export async function analyzeFile(file: File, preferredSheet?: string | null): Promise<ImportAnalysis> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(413, 'Ficheiro demasiado grande', 'O ficheiro tem de ter menos de 10 MB.');
  }
  const name = file.name || 'ficheiro';
  const lower = name.toLowerCase();

  if (lower.endsWith('.xlsx') || file.type.includes('spreadsheetml')) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      throw new ApiError(400, 'Ficheiro inválido', 'Não foi possível ler o ficheiro Excel (.xlsx).');
    }
    const sheets = workbook.worksheets.map((ws) => ({ name: ws.name, rows: worksheetRows(ws) }));
    if (!sheets.length) throw new ApiError(400, 'Ficheiro vazio', 'O ficheiro não tem folhas.');
    const chosen =
      sheets.find((s) => s.name === preferredSheet) ??
      // Folha com o cabeçalho mais reconhecível (ex.: "🎯 Pipeline de Leads").
      [...sheets].sort((a, b) => headerScore(b.rows) - headerScore(a.rows))[0]!;
    return buildAnalysis('xlsx', name, sheets.map((s) => s.name), chosen.name, chosen.rows);
  }

  if (lower.endsWith('.csv') || lower.endsWith('.txt') || file.type.includes('csv') || file.type.startsWith('text/')) {
    const text = (await file.text()).replace(/^﻿/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false, delimitersToGuess: [';', ',', '\t', '|'] });
    const rows = parsed.data.map((r) => r.map((c) => (c ?? '').trim()));
    return buildAnalysis('csv', name, [], null, rows);
  }

  throw new ApiError(415, 'Formato não suportado', 'Usa um ficheiro .csv ou .xlsx (no Google Sheets: Ficheiro → Transferir).');
}

// -----------------------------------------------------------------------------
// 2. Pré-visualização
// -----------------------------------------------------------------------------

type DupRow = {
  row_index: number;
  lead_id: string;
  number: number;
  company_name: string;
  status: ImportPreviewRow['duplicates'][number]['status'];
  reasons: ImportPreviewRow['duplicates'][number]['reasons'];
  strength: 'strong' | 'possible';
};
type DncRow = { row_index: number; entry_id: string; company_name: string; reason: string | null };

export async function lookupConflicts(
  ctx: ApiContext,
  probes: { company_name?: string | null; website?: string | null; email?: string | null }[],
) {
  const [dups, dnc] = await Promise.all([
    ctx.supabase.rpc('find_import_duplicates', { p_workspace_id: ctx.workspaceId, p_rows: probes }),
    ctx.supabase.rpc('check_import_do_not_contact', { p_workspace_id: ctx.workspaceId, p_rows: probes }),
  ]);
  if (dups.error) throw fromPostgrest(dups.error);
  if (dnc.error) throw fromPostgrest(dnc.error);
  return { dups: (dups.data ?? []) as DupRow[], dnc: (dnc.data ?? []) as DncRow[] };
}

export async function previewImport(
  ctx: ApiContext,
  input: { rows: string[][]; mapping: ImportTarget[] },
): Promise<ImportPreview> {
  const sectors = await listSectors(ctx, true);
  const mapped = input.rows.map((row) => (isEmptyRow(row) ? null : mapImportRow(row, input.mapping, sectors)));
  const leads = mapped.map((m) => (m?.ok ? m.value.lead : null));
  const inFile = findBatchDuplicates(leads);
  const probes = leads.map((l) => (l ? { company_name: l.company_name, website: l.website ?? null, email: l.email ?? null } : {}));
  const { dups, dnc } = await lookupConflicts(ctx, probes);

  const rows: ImportPreviewRow[] = mapped.map((m, index) => {
    const duplicates = dups
      .filter((d) => d.row_index === index)
      .map(({ lead_id, number, company_name, status, reasons, strength }) => ({
        lead_id, number, company_name, status, reasons, strength,
      }));
    const blockedBy = dnc
      .filter((d) => d.row_index === index)
      .map((d) => ({ id: d.entry_id, company_name: d.company_name, reason: d.reason }));
    const base = { index, duplicates, do_not_contact: blockedBy, in_file_duplicate_of: inFile[index] ?? null };

    if (m === null) {
      return { ...base, status: 'empty', lead: null, number: null, warnings: [], errors: [], suggested_action: 'skip', blocked: false };
    }
    if (!m.ok) {
      return { ...base, status: 'invalid', lead: null, number: null, warnings: m.warnings, errors: m.errors, suggested_action: 'skip', blocked: false };
    }
    const strong = duplicates.some((d) => d.strength === 'strong');
    const blocked = blockedBy.length > 0;
    return {
      ...base,
      status: 'ok',
      lead: m.value.lead as Record<string, unknown>,
      number: m.value.number,
      warnings: m.value.warnings,
      errors: [],
      suggested_action: blocked || strong || base.in_file_duplicate_of !== null ? 'skip' : 'create',
      blocked,
    };
  });

  const ok = rows.filter((r) => r.status === 'ok');
  return {
    rows,
    summary: {
      total: rows.filter((r) => r.status !== 'empty').length,
      create: ok.filter((r) => r.suggested_action === 'create').length,
      merge: 0,
      skip: ok.filter((r) => r.suggested_action === 'skip' && !r.blocked).length,
      blocked: ok.filter((r) => r.blocked).length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
      duplicates: ok.filter((r) => r.duplicates.some((d) => d.strength === 'strong') || r.in_file_duplicate_of !== null).length,
    },
  };
}

// -----------------------------------------------------------------------------
// 3. Gravar
// -----------------------------------------------------------------------------

export type CommitImportInput = Omit<ImportCommit, 'source'> & {
  source: ImportJob['source'];
  /** Opções extra guardadas no histórico (ex.: on_duplicate da API). */
  options?: Record<string, unknown>;
  idempotency_key?: string | null;
};

export async function commitImport(ctx: ApiContext, input: CommitImportInput): Promise<ImportJob> {
  for (const item of input.items) {
    if (item.action === 'merge' && !item.target_id) {
      throw new ApiError(400, 'Pedido inválido', `Linha ${item.index + 1}: indica o lead a juntar.`);
    }
  }

  // A lista "não contactar" é verificada outra vez no momento de gravar.
  const toWrite = input.items.filter((i) => i.action !== 'skip');
  const { dnc } = await lookupConflicts(
    ctx,
    toWrite.map((i) => ({ company_name: i.lead.company_name, website: i.lead.website ?? null, email: i.lead.email ?? null })),
  );
  const blockedIdx = new Set(dnc.map((d) => d.row_index));
  const allowed = toWrite.filter((_, i) => !blockedIdx.has(i));

  const { data: job, error: jobError } = await ctx.supabase
    .from('import_jobs')
    .insert({
      workspace_id: ctx.workspaceId,
      source: input.source,
      filename: input.filename ?? null,
      options: { keep_numbers: input.keep_numbers, ...input.options },
      idempotency_key: input.idempotency_key ?? null,
      created_by: ctx.user.id,
    })
    .select('id, created_at')
    .single();
  if (jobError) throw fromPostgrest(jobError);

  const { data: results, error } = await ctx.supabase.rpc('import_leads', {
    p_workspace_id: ctx.workspaceId,
    p_job_id: job.id,
    p_keep_numbers: input.keep_numbers,
    p_items: allowed.map((i) => ({
      action: i.action,
      target_id: i.target_id ?? null,
      number: i.number ?? null,
      lead: i.lead,
    })),
  });
  if (error) {
    await ctx.supabase.from('import_jobs').delete().eq('id', job.id);
    throw fromPostgrest(error);
  }

  const written = new Map<number, { action: string; lead_id: string; number: number }>();
  for (const r of (results ?? []) as { item_index: number; action: string; lead_id: string; number: number }[]) {
    written.set(allowed[r.item_index]!.index, r);
  }
  const blockedRows = new Set(toWrite.filter((_, i) => blockedIdx.has(i)).map((i) => i.index));

  const report: ImportJob['report'] = input.items.map((item) => {
    const w = written.get(item.index);
    return {
      index: item.index,
      result: w ? (w.action === 'merged' ? 'merged' : 'created') : blockedRows.has(item.index) ? 'blocked' : 'skipped',
      lead_id: w?.lead_id ?? null,
      number: w?.number ?? null,
      company_name: item.lead.company_name,
    };
  });
  const stats = {
    created: report.filter((r) => r.result === 'created').length,
    merged: report.filter((r) => r.result === 'merged').length,
    skipped: report.filter((r) => r.result === 'skipped').length,
    blocked: report.filter((r) => r.result === 'blocked').length,
  };
  await ctx.supabase.from('import_jobs').update({ stats, report }).eq('id', job.id);

  return {
    id: job.id as string,
    source: input.source,
    filename: input.filename ?? null,
    stats,
    report,
    created_at: job.created_at as string,
  };
}

export async function listImports(ctx: ApiContext): Promise<ImportJob[]> {
  const { data, error } = await ctx.supabase
    .from('import_jobs')
    .select('id, source, filename, stats, report, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw fromPostgrest(error);
  return (data ?? []) as ImportJob[];
}
