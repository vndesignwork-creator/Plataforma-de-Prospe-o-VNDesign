/**
 * Caso de estudo em PDF (A4): o mesmo texto do portefólio, pronto a juntar a
 * uma proposta ou a enviar a um cliente novo.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatDate, type CaseStudy } from '@vndesign/core';
import { ACCENT, LINE, MUTED, registerFonts } from '../proposals/pdf';

export interface CaseStudyPdfData {
  study: CaseStudy;
  company: string;
  preparedBy: { name: string | null; company: string | null; website: string | null; email: string | null };
  today: string;
}

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 10.5, color: '#141414', paddingBottom: 56, paddingHorizontal: 48, paddingTop: 44 },
  kicker: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: MUTED },
  title: { fontFamily: 'Syne', fontWeight: 800, fontSize: 24, marginTop: 8, lineHeight: 1.2 },
  summary: { fontSize: 12, lineHeight: 1.5, color: '#141414', marginTop: 12 },
  rule: { height: 3, width: 54, backgroundColor: ACCENT, marginTop: 16, marginBottom: 20 },
  h2: { fontFamily: 'Syne', fontWeight: 800, fontSize: 13, marginBottom: 6 },
  section: { marginBottom: 18 },
  body: { fontSize: 10.5, lineHeight: 1.6 },
  item: { flexDirection: 'row', marginBottom: 5 },
  dot: { width: 12, color: ACCENT },
  quote: { marginTop: 4, borderLeftWidth: 2, borderLeftColor: ACCENT, paddingLeft: 12, fontSize: 11, lineHeight: 1.5 },
  quoteAuthor: { fontSize: 9, color: MUTED, marginTop: 4 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

function CaseStudyDoc({ study, company, preparedBy, today }: CaseStudyPdfData) {
  const by = [preparedBy.company ?? preparedBy.name, preparedBy.website, preparedBy.email].filter(Boolean).join(' · ');
  return (
    <Document title={study.title} author={preparedBy.company ?? preparedBy.name ?? 'VNDesign'} language="pt-PT">
      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text>{by || company}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>

        <Text style={s.kicker}>Caso de estudo{study.anonymous ? '' : ` · ${company}`}</Text>
        <Text style={s.title}>{study.title}</Text>
        {study.summary ? <Text style={s.summary}>{study.summary}</Text> : null}
        <View style={s.rule} />

        <View style={s.section}>
          <Text style={s.h2}>O desafio</Text>
          <Text style={s.body}>{study.challenge}</Text>
        </View>

        {study.work.length ? (
          <View style={s.section}>
            <Text style={s.h2}>O que fizemos</Text>
            {study.work.map((w, i) => (
              <View key={i} style={s.item}>
                <Text style={s.dot}>•</Text>
                <Text style={[s.body, { flex: 1 }]}>{w}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.section}>
          <Text style={s.h2}>O resultado</Text>
          <Text style={s.body}>{study.result}</Text>
        </View>

        {study.quote ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>O que diz o cliente</Text>
            <Text style={s.quote}>“{study.quote}”</Text>
            {study.quote_author ? <Text style={s.quoteAuthor}>— {study.quote_author}</Text> : null}
          </View>
        ) : null}

        <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 8 }}>{formatDate(today)}</Text>
      </Page>
    </Document>
  );
}

export async function renderCaseStudyPdf(data: CaseStudyPdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<CaseStudyDoc {...data} />);
}
