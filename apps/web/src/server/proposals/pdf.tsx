/**
 * PDF da proposta (A4) com a identidade da VNDesign: cabeçalho escuro, laranja
 * #EF5C32, Syne nos títulos e Plus Jakarta Sans no texto.
 */
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import {
  formatCurrency,
  formatDate,
  formatSignature,
  proposalTotals,
  type Proposal,
  type Signature,
  type WorkspaceSettings,
} from '@vndesign/core';
import path from 'node:path';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'pdf');
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: 'Jakarta',
    fonts: [
      { src: path.join(FONT_DIR, 'plus-jakarta-sans-latin-400-normal.woff'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'plus-jakarta-sans-latin-600-normal.woff'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'plus-jakarta-sans-latin-700-normal.woff'), fontWeight: 700 },
      { src: path.join(FONT_DIR, 'plus-jakarta-sans-latin-800-normal.woff'), fontWeight: 800 },
    ],
  });
  Font.register({
    family: 'Syne',
    fonts: [
      { src: path.join(FONT_DIR, 'syne-latin-700-normal.woff'), fontWeight: 700 },
      { src: path.join(FONT_DIR, 'syne-latin-800-normal.woff'), fontWeight: 800 },
    ],
  });
  // Sem hifenização automática (palavras portuguesas cortadas ao meio ficam feias).
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const ACCENT = '#EF5C32';
const INK = '#141414';
const MUTED = '#5f5b53';
const LINE = '#e6e2da';
const SOFT = '#f7f4ef';

const s = StyleSheet.create({
  // Nota: sem lineHeight — na página esconde o rodapé fixo e nos textos duplica o espaçamento (react-pdf).
  page: { fontFamily: 'Jakarta', fontSize: 10, color: INK, paddingBottom: 56 },
  header: { backgroundColor: '#0d0d0d', color: '#f5f2ed', paddingHorizontal: 40, paddingTop: 30, paddingBottom: 26 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontFamily: 'Syne', fontWeight: 800, fontSize: 20 },
  logoAccent: { color: ACCENT },
  headerMeta: { fontSize: 9, color: '#a9a59c', textAlign: 'right' },
  headerMetaStrong: { color: '#f5f2ed', fontWeight: 700, fontSize: 10 },
  title: { fontFamily: 'Syne', fontWeight: 800, fontSize: 22, marginTop: 22, lineHeight: 1.2 },
  forLine: { fontSize: 10, color: '#d8d4cc', marginTop: 6 },
  body: { paddingHorizontal: 40, paddingTop: 24 },
  h2: { fontFamily: 'Syne', fontWeight: 700, fontSize: 13, marginBottom: 8, marginTop: 18 },
  paragraph: { marginBottom: 7 },
  item: { borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 12, marginBottom: 10 },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemName: { fontWeight: 700, fontSize: 12 },
  itemPrice: { fontWeight: 800, fontSize: 12 },
  itemPriceNote: { fontSize: 8, color: MUTED, textAlign: 'right' },
  itemDesc: { color: MUTED, marginTop: 3 },
  feature: { flexDirection: 'row', marginTop: 3 },
  bullet: { width: 5, height: 5, backgroundColor: ACCENT, borderRadius: 1, marginTop: 4.5, marginRight: 7 },
  totals: { marginTop: 6, marginLeft: 'auto', width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalFinal: { borderTopWidth: 1.5, borderTopColor: INK, marginTop: 4, paddingTop: 6 },
  totalFinalText: { fontWeight: 800, fontSize: 13 },
  totalFinalValue: { fontWeight: 800, fontSize: 13, color: ACCENT },
  note: { fontSize: 8.5, color: MUTED, marginTop: 4, textAlign: 'right' },
  box: { backgroundColor: SOFT, borderRadius: 6, padding: 12, marginTop: 18 },
  boxRow: { flexDirection: 'row', marginBottom: 4 },
  boxLabel: { width: 110, color: MUTED },
  boxValue: { flex: 1 },
  signature: { marginTop: 20 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

export interface ProposalPdfData {
  proposal: Proposal;
  lead: { company_name: string; contact_name: string | null; city: string | null; website: string | null; email: string | null };
  signature: Signature;
  settings: WorkspaceSettings['proposal'];
}

const euros = (v: number) => formatCurrency(v);
const bareHost = (url: string | null) => (url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null);

function ProposalDocument({ proposal, lead, signature, settings }: ProposalPdfData) {
  const totals = proposalTotals(proposal.items, proposal.discount);
  const company = signature.company || 'VNDesign';
  const contactLine = [signature.full_name, signature.phone, signature.email, bareHost(signature.website)].filter(Boolean).join(' · ');
  const created = proposal.created_at.slice(0, 10);

  return (
    <Document
      title={`Proposta ${proposal.code} — ${lead.company_name}`}
      author={signature.full_name || company}
      subject={proposal.title}
      creator="VNDesign Leads"
      producer="VNDesign Leads"
      language="pt-PT"
    >
      <Page size="A4" style={s.page}>
        {/* Rodapé em todas as páginas (tem de vir antes do conteúdo que quebra de página). */}
        <View style={s.footer} fixed>
          <Text>{contactLine || company}</Text>
          <Text render={({ pageNumber, totalPages }) => `Proposta ${proposal.code} · ${pageNumber}/${totalPages}`} />
        </View>
        <View style={s.header}>
          <View style={s.headerRow}>
            <Text style={s.logo}>
              <Text style={s.logoAccent}>VN</Text>Design
            </Text>
            <View>
              <Text style={s.headerMeta}>
                Proposta <Text style={s.headerMetaStrong}>n.º {proposal.code}</Text>
              </Text>
              <Text style={s.headerMeta}>{formatDate(created)}</Text>
            </View>
          </View>
          <Text style={s.title}>{proposal.title}</Text>
          <Text style={s.forLine}>
            Para: {lead.company_name}
            {lead.contact_name ? ` · ${lead.contact_name}` : ''}
            {lead.city ? ` · ${lead.city}` : ''}
            {lead.website ? ` · ${bareHost(lead.website)}` : ''}
          </Text>
        </View>

        <View style={s.body}>
          {proposal.intro
            ? proposal.intro.split(/\n{2,}/).map((p, i) => (
                <Text key={i} style={s.paragraph}>
                  {p}
                </Text>
              ))
            : null}

          <Text style={s.h2}>O que está incluído</Text>
          {proposal.items.map((item, i) => (
            <View key={i} style={s.item} wrap={false}>
              <View style={s.itemHead}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.itemName}>
                    {item.quantity > 1 ? `${item.quantity} × ` : ''}
                    {item.name}
                  </Text>
                  {item.description ? <Text style={s.itemDesc}>{item.description}</Text> : null}
                </View>
                <View>
                  <Text style={s.itemPrice}>
                    {euros(item.price * item.quantity)}
                    {item.recurring ? '/mês' : ''}
                  </Text>
                  {item.quantity > 1 ? <Text style={s.itemPriceNote}>{euros(item.price)} cada</Text> : null}
                </View>
              </View>
              {item.features.map((f, j) => (
                <View key={j} style={s.feature}>
                  <View style={s.bullet} />
                  <Text style={{ flex: 1 }}>{f}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={s.totals} wrap={false}>
            {totals.discount > 0 ? (
              <>
                <View style={s.totalRow}>
                  <Text>Subtotal</Text>
                  <Text>{euros(totals.subtotal)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text>Desconto</Text>
                  <Text>−{euros(totals.discount)}</Text>
                </View>
              </>
            ) : null}
            <View style={[s.totalRow, s.totalFinal]}>
              <Text style={s.totalFinalText}>Total</Text>
              <Text style={s.totalFinalValue}>{euros(totals.total)}</Text>
            </View>
            {totals.monthly > 0 ? (
              <View style={s.totalRow}>
                <Text>Mensalidade</Text>
                <Text>{euros(totals.monthly)}/mês</Text>
              </View>
            ) : null}
            {settings.tax_note ? <Text style={s.note}>{settings.tax_note}</Text> : null}
          </View>

          <View style={s.box} wrap={false}>
            {proposal.valid_until ? (
              <View style={s.boxRow}>
                <Text style={s.boxLabel}>Validade</Text>
                <Text style={s.boxValue}>Até {formatDate(proposal.valid_until)}</Text>
              </View>
            ) : null}
            {proposal.payment_terms ? (
              <View style={s.boxRow}>
                <Text style={s.boxLabel}>Pagamento</Text>
                <Text style={s.boxValue}>{proposal.payment_terms}</Text>
              </View>
            ) : null}
            {proposal.notes ? (
              <View style={s.boxRow}>
                <Text style={s.boxLabel}>Notas</Text>
                <Text style={s.boxValue}>{proposal.notes}</Text>
              </View>
            ) : null}
          </View>

          {settings.next_steps ? (
            <>
              <Text style={s.h2}>Próximos passos</Text>
              <Text style={s.paragraph}>{settings.next_steps}</Text>
            </>
          ) : null}

          <View style={s.signature} wrap={false}>
            <Text style={{ color: MUTED }}>Com os melhores cumprimentos,</Text>
            <Text style={{ fontWeight: 700, marginTop: 4 }}>{signature.full_name || company}</Text>
            <Text style={{ color: MUTED }}>{formatSignature(signature).split('\n').slice(1).join('\n')}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}

export async function renderProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ProposalDocument {...data} />);
}
