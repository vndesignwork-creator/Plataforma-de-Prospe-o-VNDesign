/**
 * Repor a partir de uma cópia de segurança (Definições → Repor a partir de uma cópia): lê o
 * Excel da cópia semanal, mostra o que falta agora (leads que já não existem, pelo número, e
 * as tarefas que faltam nos leads) e repõe SÓ isso — nada do que existe é alterado ou apagado.
 */
import { LeadCreateSchema, type BackupRestorePreview, type BackupRestoreResult } from '@vndesign/core';
import ExcelJS from 'exceljs';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { BACKUP_TASKS_SHEET } from './export';
import { analyzeFile, commitImport, previewImport, worksheetRows } from './imports';

type FileTask = { number: number; title: string; due_on: string | null; done_at: string | null };
type Plan = {
  preview: BackupRestorePreview;
  leadItems: { index: number; number: number; lead: Record<string, unknown> }[];
  tasks: FileTask[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : /^(\d{2})\/(\d{2})\/(\d{4})$/.test(v) ? v.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1') : null);

/** A folha "Tarefas" da cópia (se existir). */
async function fileTasks(file: File): Promise<FileTask[] | null> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) return null;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const ws = workbook.getWorksheet(BACKUP_TASKS_SHEET);
  if (!ws) return null;
  const rows = worksheetRows(ws);
  const header = (rows[0] ?? []).map(norm);
  const col = (name: string) => header.indexOf(norm(name));
  const [cNum, cTitle, cDue, cDone] = [col('Nº'), col('Tarefa'), col('Prazo'), col('Feita em')];
  if (cNum < 0 || cTitle < 0) return null;
  const out: FileTask[] = [];
  for (const r of rows.slice(1)) {
    const number = Number(r[cNum]);
    const title = (r[cTitle] ?? '').trim();
    if (!Number.isInteger(number) || number < 1 || !title) continue;
    out.push({
      number,
      title: title.slice(0, 300),
      due_on: cDue >= 0 ? isoDate(r[cDue] ?? '') : null,
      done_at: cDone >= 0 && isoDate(r[cDone] ?? '') ? `${isoDate(r[cDone]!)}T12:00:00Z` : null,
    });
  }
  return out;
}

async function numbersNow(ctx: ApiContext): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await ctx.supabase.from('leads').select('id, number').eq('workspace_id', ctx.workspaceId).order('number').range(from, from + 999);
    if (error) throw fromPostgrest(error);
    for (const r of (data ?? []) as { id: string; number: number }[]) out.set(r.number, r.id);
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

async function plan(ctx: ApiContext, file: File): Promise<Plan> {
  const analysis = await analyzeFile(file);
  if (!analysis.suggested_mapping.includes('company_name')) {
    throw new ApiError(422, 'Não é uma cópia', 'O ficheiro não tem a coluna do nome da empresa. Usa o Excel da cópia de segurança (vem por email).');
  }
  const [preview, existing, trash, tasks] = await Promise.all([
    previewImport(ctx, { rows: analysis.rows, mapping: analysis.suggested_mapping }, { checkEmails: false }),
    numbersNow(ctx),
    ctx.supabase.from('lead_trash').select('number, company_name').eq('workspace_id', ctx.workspaceId),
    fileTasks(file),
  ]);
  const inTrash = new Map(((trash.data ?? []) as { number: number; company_name: string }[]).map((t) => [t.number, t.company_name]));
  const ok = preview.rows.filter((r) => r.status === 'ok' && r.lead);
  const missing = ok.filter((r) => r.number !== null && !existing.has(r.number) && !inTrash.has(r.number) && !r.blocked);
  const missingNumbers = new Set(missing.map((r) => r.number!));

  // Tarefas em falta: nos leads que existem (sem uma tarefa com o mesmo título) e nos que se vão repor.
  let missingTasks: FileTask[] = [];
  if (tasks?.length) {
    const ids = [...new Set(tasks.map((t) => existing.get(t.number)).filter((id): id is string => !!id))];
    const have = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await ctx.supabase.from('lead_tasks').select('lead_id, title').eq('workspace_id', ctx.workspaceId).in('lead_id', ids.slice(i, i + 200));
      for (const t of (data ?? []) as { lead_id: string; title: string }[]) have.add(`${t.lead_id}|${norm(t.title)}`);
    }
    missingTasks = tasks.filter((t) => {
      if (missingNumbers.has(t.number)) return true;
      const id = existing.get(t.number);
      return !!id && !have.has(`${id}|${norm(t.title)}`);
    });
  }
  const companyOf = new Map(ok.filter((r) => r.number !== null).map((r) => [r.number!, String(r.lead!.company_name ?? '')]));
  return {
    preview: {
      filename: analysis.filename,
      leads_in_file: ok.length,
      missing_leads: missing.map((r) => ({ number: r.number!, company_name: String(r.lead!.company_name ?? '') })),
      in_trash: ok.filter((r) => r.number !== null && inTrash.has(r.number)).map((r) => ({ number: r.number!, company_name: String(r.lead!.company_name ?? '') })),
      without_number: ok.filter((r) => r.number === null).length,
      has_tasks: tasks !== null,
      missing_tasks: missingTasks.length,
      missing_tasks_sample: missingTasks.slice(0, 20).map((t) => ({ number: t.number, company_name: companyOf.get(t.number) ?? '', title: t.title })),
    },
    leadItems: missing.map((r) => ({ index: r.index, number: r.number!, lead: r.lead! })),
    tasks: missingTasks,
  };
}

export async function previewRestore(ctx: ApiContext, file: File): Promise<BackupRestorePreview> {
  return (await plan(ctx, file)).preview;
}

export async function restoreBackup(ctx: ApiContext, file: File): Promise<BackupRestoreResult> {
  const p = await plan(ctx, file);
  let leadsRestored = 0;
  let skipped = 0;
  if (p.leadItems.length) {
    const job = await commitImport(ctx, {
      source: 'xlsx',
      filename: p.preview.filename,
      keep_numbers: true,
      options: { restore: true },
      items: p.leadItems.map((i) => ({ index: i.index, action: 'create' as const, number: i.number, lead: LeadCreateSchema.parse(i.lead) })),
    });
    leadsRestored = job.stats.created;
    skipped = job.stats.skipped + job.stats.blocked;
  }
  // Os números agora (os leads repostos ficam com o número da cópia, quando estava livre).
  const numbers = await numbersNow(ctx);
  const rows = p.tasks
    .map((t) => ({ t, lead_id: numbers.get(t.number) }))
    .filter((x): x is { t: FileTask; lead_id: string } => !!x.lead_id)
    .map(({ t, lead_id }) => ({ workspace_id: ctx.workspaceId, lead_id, title: t.title, due_on: t.due_on, done_at: t.done_at, created_by: ctx.user.id }));
  let tasksRestored = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error, count } = await ctx.supabase.from('lead_tasks').insert(rows.slice(i, i + 500), { count: 'exact' });
    if (error) throw fromPostgrest(error);
    tasksRestored += count ?? 0;
  }
  return { leads_restored: leadsRestored, tasks_restored: tasksRestored, skipped };
}
