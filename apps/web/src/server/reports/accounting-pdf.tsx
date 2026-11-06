/**
 * O relatório da contabilidade em PDF (A4), com a identidade das propostas:
 * cabeçalho escuro, resumo em caixas e as três tabelas (recebido, despesas, por receber).
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatCurrency, formatDate, type AccountingReport } from '@vndesign/core';
import { ACCENT, INK, LINE, MUTED, SOFT, registerFonts } from '../proposals/pdf';

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 9, color: INK, paddingBottom: 50 },
  header: { backgroundColor: '#0d0d0d', color: '#f5f2ed', paddingHorizontal: 36, paddingTop: 24, paddingBottom: 20 },
  logo: { fontFamily: 'Syne', fontWeight: 800, fontSize: 16 },
  accent: { color: ACCENT },
  title: { fontFamily: 'Syne', fontWeight: 800, fontSize: 17, marginTop: 12 },
  meta: { fontSize: 8.5, color: '#a9a59c', marginTop: 3 },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, backgroundColor: SOFT, borderRadius: 5, padding: 9 },
  boxLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase' },
  boxValue: { fontWeight: 700, fontSize: 13, marginTop: 3 },
  h2: { fontFamily: 'Syne', fontWeight: 700, fontSize: 11, marginTop: 18, marginBottom: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4 },
  head: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 3, fontWeight: 700, fontSize: 8 },
  date: { width: 58 },
  client: { width: 130, paddingRight: 6 },
  desc: { flex: 1, paddingRight: 6 },
  amount: { width: 70, textAlign: 'right' },
  total: { flexDirection: 'row', paddingTop: 5, fontWeight: 700 },
  // Sem itálico: a letra do PDF (Jakarta) não tem a versão itálica e o PDF falhava nos meses sem movimentos.
  empty: { color: MUTED },
  late: { color: '#b42318' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 5,
  },
});

type Line = { date: string | null; client: string; lead_number: number | null; description: string; amount: number; note?: string; late?: boolean };

function Table({ title, rows, total, dateLabel = 'Data' }: { title: string; rows: Line[]; total: number; dateLabel?: string }) {
  return (
    <View>
      <Text style={s.h2}>{title}</Text>
      {rows.length ? (
        <>
          <View style={s.head} fixed>
            <Text style={s.date}>{dateLabel}</Text>
            <Text style={s.client}>Cliente</Text>
            <Text style={s.desc}>Descrição</Text>
            <Text style={s.amount}>Valor</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={[s.date, r.late ? s.late : {}]}>{r.date ? formatDate(r.date) : 'sem data'}</Text>
              <Text style={s.client}>
                {r.lead_number ? `#${r.lead_number} ` : ''}
                {r.client}
              </Text>
              <Text style={s.desc}>
                {r.description}
                {r.note ? ` · ${r.note}` : ''}
              </Text>
              <Text style={s.amount}>{formatCurrency(r.amount)}</Text>
            </View>
          ))}
          <View style={s.total}>
            <Text style={{ flex: 1 }}>Total</Text>
            <Text style={s.amount}>{formatCurrency(total)}</Text>
          </View>
        </>
      ) : (
        <Text style={s.empty}>Nada neste mês.</Text>
      )}
    </View>
  );
}

function AccountingDocument({ report, brand }: { report: AccountingReport; brand: string }) {
  const title = `Relatório de ${report.label}`;
  return (
    <Document title={title} author={brand} language="pt-PT">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.logo}>
            {brand.startsWith('VN') ? (
              <>
                <Text style={s.accent}>VN</Text>
                {brand.slice(2)}
              </>
            ) : (
              brand
            )}
          </Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.meta}>
            De {formatDate(report.from)} a {formatDate(report.to)} · para a contabilidade
          </Text>
        </View>
        <View style={s.body}>
          <View style={s.boxes}>
            <View style={s.box}>
              <Text style={s.boxLabel}>Recebido</Text>
              <Text style={s.boxValue}>{formatCurrency(report.received.total)}</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Despesas</Text>
              <Text style={s.boxValue}>{formatCurrency(report.expenses.total)}</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Resultado</Text>
              <Text style={s.boxValue}>{formatCurrency(report.result)}</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Por receber</Text>
              <Text style={s.boxValue}>{formatCurrency(report.outstanding.total)}</Text>
              {report.outstanding.overdue ? <Text style={[s.late, { fontSize: 7.5, marginTop: 2 }]}>{formatCurrency(report.outstanding.overdue)} em atraso</Text> : null}
            </View>
          </View>
          <Table title="Recebido" rows={report.received.rows.map((r) => ({ ...r, note: r.method ?? undefined }))} total={report.received.total} />
          <Table title="Despesas" rows={report.expenses.rows} total={report.expenses.total} />
          <Table title="Por receber" dateLabel="Prevista" rows={report.outstanding.rows.map((r) => ({ ...r, late: r.overdue, note: r.overdue ? 'em atraso' : undefined }))} total={report.outstanding.total} />
        </View>
        <View style={s.footer} fixed>
          <Text>
            {brand} · {title}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function accountingPdf(report: AccountingReport, brand: string): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<AccountingDocument report={report} brand={brand} />);
}
