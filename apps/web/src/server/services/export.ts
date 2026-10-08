import { EXPORT_COLUMNS, leadsToCsv, todayIso, type Lead } from '@vndesign/core';
import ExcelJS from 'exceljs';

/** Data "AAAA-MM-DD" → Date UTC (o Excel mostra-a sem desvios de fuso). */
function toExcelDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export async function leadsToXlsx(leads: readonly Lead[]): Promise<Buffer> {
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

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportLeads(leads: readonly Lead[], format: 'csv' | 'xlsx') {
  const filename = `leads-vndesign-${todayIso()}.${format}`;
  if (format === 'csv') {
    return { filename, contentType: 'text/csv; charset=utf-8', body: leadsToCsv(leads) as string | Buffer };
  }
  return {
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: (await leadsToXlsx(leads)) as string | Buffer,
  };
}
