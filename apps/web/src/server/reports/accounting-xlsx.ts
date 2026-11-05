/** O relatório da contabilidade em Excel: Resumo, Recebido, Despesas e Por receber (datas e valores a sério, para somar). */
import type { AccountingReport } from '@vndesign/core';
import ExcelJS from 'exceljs';

const EUR = '#,##0.00 "€"';
const toDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : null);

export async function accountingXlsx(report: AccountingReport, brand: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = brand;
  wb.created = new Date();

  const resumo = wb.addWorksheet('Resumo');
  resumo.columns = [{ width: 34 }, { width: 18 }];
  resumo.addRow([`${brand} — relatório de ${report.label}`]).font = { bold: true, size: 13 };
  resumo.addRow([`De ${report.from.split('-').reverse().join('/')} a ${report.to.split('-').reverse().join('/')}`]);
  resumo.addRow([]);
  const lines: [string, number][] = [
    ['Recebido no mês', report.received.total],
    ['Despesas no mês', report.expenses.total],
    ['Resultado (recebido − despesas)', report.result],
    ['Por receber (até ao fim do mês ou sem data)', report.outstanding.total],
    ['…dos quais em atraso', report.outstanding.overdue],
  ];
  for (const [label, value] of lines) {
    const row = resumo.addRow([label, value]);
    row.getCell(2).numFmt = EUR;
  }
  resumo.getRow(6).font = { bold: true };

  const sheet = (name: string, headers: string[], widths: number[], rows: (string | number | Date | null)[][], amountCol: number, dateCol = 1) => {
    const ws = wb.addWorksheet(name);
    ws.columns = widths.map((width) => ({ width }));
    const head = ws.addRow(headers);
    head.font = { bold: true };
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EEE8' } }));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of rows) {
      const row = ws.addRow(r);
      row.getCell(amountCol).numFmt = EUR;
      row.getCell(dateCol).numFmt = 'dd/mm/yyyy';
    }
    const total = ws.addRow(headers.map((_, i) => (i === 0 ? 'Total' : i + 1 === amountCol ? rows.reduce((a, r) => a + Number(r[amountCol - 1] ?? 0), 0) : null)));
    total.font = { bold: true };
    total.getCell(amountCol).numFmt = EUR;
  };
  sheet(
    'Recebido',
    ['Data', 'Cliente', 'N.º', 'Descrição', 'Método', 'Valor'],
    [12, 34, 7, 40, 16, 14],
    report.received.rows.map((r) => [toDate(r.date), r.client, r.lead_number, r.description, r.method ?? '', r.amount]),
    6,
  );
  sheet(
    'Despesas',
    ['Data', 'Cliente / projeto', 'N.º', 'Descrição', 'Valor'],
    [12, 34, 7, 46, 14],
    report.expenses.rows.map((r) => [toDate(r.date), r.client, r.lead_number, r.description, r.amount]),
    5,
  );
  sheet(
    'Por receber',
    ['Data prevista', 'Cliente', 'N.º', 'Descrição', 'Em atraso', 'Valor'],
    [14, 34, 7, 40, 11, 14],
    report.outstanding.rows.map((r) => [toDate(r.date), r.client, r.lead_number, r.description, r.overdue ? 'Sim' : '', r.amount]),
    6,
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
