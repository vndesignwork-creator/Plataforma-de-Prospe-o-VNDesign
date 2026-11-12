/**
 * Relatório mensal do site para o cliente (A4): quanto tempo esteve no ar, as quebras,
 * quanto demora a abrir, o certificado e o domínio — em linguagem simples, com a
 * identidade das propostas (cabeçalho escuro, resumo em caixas).
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatDate, formatDowntime, formatUptime, type SiteUptime } from '@vndesign/core';
import { ACCENT, INK, LINE, MUTED, SOFT, registerFonts } from '../proposals/pdf';

const GOOD = '#1f8a4c';
const WARN = '#b7791f';
const BAD = '#b42318';

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 9.5, color: INK, paddingBottom: 50 },
  header: { backgroundColor: '#0d0d0d', color: '#f5f2ed', paddingHorizontal: 36, paddingTop: 24, paddingBottom: 20 },
  logo: { fontFamily: 'Syne', fontWeight: 800, fontSize: 16 },
  accent: { color: ACCENT },
  title: { fontFamily: 'Syne', fontWeight: 800, fontSize: 17, marginTop: 12 },
  meta: { fontSize: 8.5, color: '#a9a59c', marginTop: 3 },
  body: { paddingHorizontal: 36, paddingTop: 18 },
  lead: { fontSize: 10.5, lineHeight: 1.5 },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 14 },
  box: { flex: 1, backgroundColor: SOFT, borderRadius: 5, padding: 9 },
  boxLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase' },
  boxValue: { fontWeight: 700, fontSize: 13, marginTop: 3 },
  boxNote: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  h2: { fontFamily: 'Syne', fontWeight: 700, fontSize: 11, marginTop: 20, marginBottom: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 46, gap: 1.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  bar: { flex: 1, borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: MUTED, marginTop: 3 },
  legend: { flexDirection: 'row', gap: 10, fontSize: 7.5, color: MUTED, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 3 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4 },
  head: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 3, fontWeight: 700, fontSize: 8 },
  col: { flex: 1 },
  dur: { width: 90, textAlign: 'right' },
  muted: { color: MUTED },
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

export interface SiteReportInput {
  brand: string;
  client: string;
  host: string;
  /** "outubro de 2026" */
  monthLabel: string;
  uptime: SiteUptime;
  ssl_until: string | null;
  domain_until: string | null;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }).format(new Date(iso));
const barColor = (v: number | null) => (v === null ? LINE : v >= 99.9 ? GOOD : v >= 98 ? WARN : BAD);

/** O resumo em frases simples (o que o cliente lê primeiro). */
export function siteReportSummary(r: SiteReportInput): string {
  const u = r.uptime;
  if (u.uptime_pct === null) return `Em ${r.monthLabel} ainda não havia verificações do site ${r.host}.`;
  const parts = [`Em ${r.monthLabel}, o site ${r.host} esteve no ar ${formatUptime(u.uptime_pct)} do tempo.`];
  if (!u.incidents.length) parts.push('Não houve nenhuma quebra.');
  else if (u.incidents.length === 1) parts.push(`Houve 1 quebra, de ${formatDowntime(u.incidents[0]!.minutes)}${u.incidents[0]!.end ? ', já resolvida' : ''}.`);
  else parts.push(`Houve ${u.incidents.length} quebras, ao todo ${formatDowntime(u.down_minutes)}.`);
  if (u.avg_response_ms !== null) parts.push(`Em média, o site respondeu em ${seconds(u.avg_response_ms)}.`);
  return parts.join(' ');
}

function SiteReportDocument({ r }: { r: SiteReportInput }) {
  const title = `Relatório do site — ${r.monthLabel}`;
  const u = r.uptime;
  const first = u.days[0]?.day;
  const last = u.days[u.days.length - 1]?.day;
  return (
    <Document title={title} author={r.brand} language="pt-PT">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.logo}>
            {r.brand.startsWith('VN') ? (
              <>
                <Text style={s.accent}>VN</Text>
                {r.brand.slice(2)}
              </>
            ) : (
              r.brand
            )}
          </Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.meta}>
            {r.host} · {r.client}
          </Text>
        </View>
        <View style={s.body}>
          <Text style={s.lead}>{siteReportSummary(r)}</Text>
          <View style={s.boxes}>
            <View style={s.box}>
              <Text style={s.boxLabel}>Tempo no ar</Text>
              <Text style={[s.boxValue, { color: barColor(u.uptime_pct) === LINE ? INK : barColor(u.uptime_pct) }]}>{formatUptime(u.uptime_pct)}</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Quebras</Text>
              <Text style={s.boxValue}>{u.incidents.length}</Text>
              {u.down_minutes ? <Text style={s.boxNote}>{formatDowntime(u.down_minutes)} ao todo</Text> : null}
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Tempo de resposta</Text>
              <Text style={s.boxValue}>{u.avg_response_ms === null ? '—' : seconds(u.avg_response_ms)}</Text>
              <Text style={s.boxNote}>média</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Certificado SSL</Text>
              <Text style={[s.boxValue, { fontSize: 11 }]}>{r.ssl_until ? formatDate(r.ssl_until) : '—'}</Text>
              <Text style={s.boxNote}>válido até</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Domínio</Text>
              <Text style={[s.boxValue, { fontSize: 11 }]}>{r.domain_until ? formatDate(r.domain_until) : '—'}</Text>
              <Text style={s.boxNote}>registado até</Text>
            </View>
          </View>

          <Text style={s.h2}>Dia a dia</Text>
          <View style={s.bars}>
            {u.days.map((d) => (
              <View key={d.day} style={[s.bar, { height: d.uptime_pct === null ? 4 : Math.max(6, (d.uptime_pct / 100) * 46), backgroundColor: barColor(d.uptime_pct) }]} />
            ))}
          </View>
          {first && last ? (
            <View style={s.barLabels}>
              <Text>{formatDate(first)}</Text>
              <Text>{formatDate(last)}</Text>
            </View>
          ) : null}
          <View style={s.legend}>
            {(
              [
                [GOOD, 'Sempre no ar'],
                [WARN, 'Uma quebra curta'],
                [BAD, 'Mais tempo em baixo'],
                [LINE, 'Sem dados'],
              ] as const
            ).map(([color, label]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.dot, { backgroundColor: color }]} />
                <Text>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.h2}>Quebras</Text>
          {u.incidents.length ? (
            <>
              <View style={s.head}>
                <Text style={s.col}>Início</Text>
                <Text style={s.col}>Voltou</Text>
                <Text style={s.dur}>Duração</Text>
              </View>
              {u.incidents.map((i) => (
                <View key={i.start} style={s.row} wrap={false}>
                  <Text style={s.col}>{dateTime(i.start)}</Text>
                  <Text style={s.col}>{i.end ? dateTime(i.end) : 'ainda em baixo'}</Text>
                  <Text style={s.dur}>{formatDowntime(i.minutes)}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={s.muted}>Nenhuma neste mês.</Text>
          )}

          <Text style={[s.muted, { marginTop: 18, fontSize: 8 }]}>
            O site é verificado automaticamente de hora a hora ({u.checks === 1 ? '1 verificação' : `${u.checks.toLocaleString('pt-PT')} verificações`} neste mês). Só conta como “em baixo” depois de falhar duas
            vezes seguidas; a duração de cada quebra é aproximada ao intervalo entre verificações.
          </Text>
        </View>
        <View style={s.footer} fixed>
          <Text>
            {r.brand} · {title}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function siteReportPdf(r: SiteReportInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<SiteReportDocument r={r} />);
}
