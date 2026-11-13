import { exportColumns, leadsToCsv, todayIso, type CustomField, type Lead, type ServiceInfo } from '@vndesign/core';
import ExcelJS from 'exceljs';

/** Data "AAAA-MM-DD" → Date UTC (o Excel mostra-a sem desvios de fuso). */
function toExcelDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Uma tarefa na folha "Tarefas" da cópia de segurança (para a poder repor). */
export interface BackupTask {
  number: number;
  company_name: string;
  title: string;
  due_on: string | null;
  done_at: string | null;
}

/** Nomes das colunas da folha "Tarefas" (a reposição lê-as por estes nomes). */
export const BACKUP_TASKS_SHEET = 'Tarefas';
export const BACKUP_TASK_HEADERS = ['Nº', 'Empresa', 'Tarefa', 'Prazo', 'Feita em'] as const;

export async function leadsToXlsx(
  leads: readonly Lead[],
  services?: readonly ServiceInfo[],
  fields: readonly CustomField[] = [],
  tasks?: readonly BackupTask[],
): Promise<Buffer> {
  const EXPORT_COLUMNS = exportColumns(services, fields);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VNDesign Leads';
  workbook.created = new Date();
  const ws = workbook.addWorksheet('🎯 Pipeline de Leads', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FF0D0D0D' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF5C32' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  for (const lead of leads) {
    const row = ws.addRow(
      EXPORT_COLUMNS.map((c) => {
        const v = c.value(lead);
        if (v === null || v === '') return null;
        if (c.kind === 'date') return toExcelDate(String(v));
        if (c.kind === 'url') return { text: String(v), hyperlink: String(v) };
        return v;
      }),
    );
    row.alignment = { vertical: 'top', wrapText: false };
  }

  EXPORT_COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.kind === 'date') col.numFmt = 'dd/mm/yyyy';
    if (c.kind === 'currency') col.numFmt = '#,##0.00 "€"';
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  // Cópia de segurança: as tarefas dos leads numa segunda folha (Definições → Repor a partir de uma cópia).
  if (tasks) {
    const sheet = workbook.addWorksheet(BACKUP_TASKS_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: BACKUP_TASK_HEADERS[0], width: 8 },
      { header: BACKUP_TASK_HEADERS[1], width: 30 },
      { header: BACKUP_TASK_HEADERS[2], width: 50 },
      { header: BACKUP_TASK_HEADERS[3], width: 12 },
      { header: BACKUP_TASK_HEADERS[4], width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const t of tasks) {
      sheet.addRow([t.number, t.company_name, t.title, t.due_on ? toExcelDate(t.due_on) : null, t.done_at ? toExcelDate(t.done_at.slice(0, 10)) : null]);
    }
    sheet.getColumn(4).numFmt = 'dd/mm/yyyy';
    sheet.getColumn(5).numFmt = 'dd/mm/yyyy';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportLeads(leads: readonly Lead[], format: 'csv' | 'xlsx', services?: readonly ServiceInfo[], fields: readonly CustomField[] = []) {
  const filename = `leads-vndesign-${todayIso()}.${format}`;
  if (format === 'csv') {
    return { filename, contentType: 'text/csv; charset=utf-8', body: leadsToCsv(leads, services, fields) as string | Buffer };
  }
  return {
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: (await leadsToXlsx(leads, services, fields)) as string | Buffer,
  };
}
