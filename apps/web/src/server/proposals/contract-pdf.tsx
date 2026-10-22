/**
 * PDF do contrato (A4), com a mesma identidade da proposta: cabeçalho escuro,
 * laranja #EF5C32, as duas partes, as cláusulas numeradas e as assinaturas (ou
 * o registo da aceitação online).
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatDate, formatDateTime, type ContractParty, type LeadContract } from '@vndesign/core';
import { ACCENT, INK, LINE, MUTED, SOFT, registerFonts } from './pdf';

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 9.5, color: INK, paddingBottom: 56 },
  header: { backgroundColor: '#0d0d0d', color: '#f5f2ed', paddingHorizontal: 40, paddingTop: 26, paddingBottom: 22 },
  logo: { fontFamily: 'Syne', fontWeight: 800, fontSize: 18 },
  logoAccent: { color: ACCENT },
  title: { fontFamily: 'Syne', fontWeight: 800, fontSize: 18, marginTop: 16 },
  meta: { fontSize: 9, color: '#a9a59c', marginTop: 4 },
  body: { paddingHorizontal: 40, paddingTop: 20 },
  parties: { flexDirection: 'row', gap: 12 },
  party: { flex: 1, backgroundColor: SOFT, borderRadius: 6, padding: 10 },
  partyLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', marginBottom: 3 },
  partyName: { fontWeight: 700, fontSize: 10.5, marginBottom: 2 },
  partyLine: { color: MUTED },
  h2: { fontFamily: 'Syne', fontWeight: 700, fontSize: 11.5, marginTop: 16, marginBottom: 5 },
  num: { color: ACCENT },
  line: { marginBottom: 3 },
  accepted: { marginTop: 22, borderWidth: 1, borderColor: ACCENT, borderRadius: 6, padding: 10 },
  signatures: { flexDirection: 'row', gap: 24, marginTop: 34 },
  sign: { flex: 1, borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 5, color: MUTED },
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

function Party({ label, party }: { label: string; party: ContractParty }) {
  const lines = [party.company && party.company !== party.name ? party.company : null, party.nif ? `NIF ${party.nif}` : null, party.address, party.email, party.phone].filter(
    Boolean,
  );
  return (
    <View style={s.party}>
      <Text style={s.partyLabel}>{label}</Text>
      <Text style={s.partyName}>{party.name}</Text>
      {lines.map((l) => (
        <Text key={l} style={s.partyLine}>
          {l}
        </Text>
      ))}
    </View>
  );
}

function ContractDocument({ contract }: { contract: LeadContract }) {
  const { provider, client, sections } = contract.content;
  const brand = provider.company || provider.name;
  return (
    <Document title={contract.title} author={brand} language="pt-PT">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.logo}>
            {brand.startsWith('VN') ? (
              <>
                <Text style={s.logoAccent}>VN</Text>
                {brand.slice(2)}
              </>
            ) : (
              brand
            )}
          </Text>
          <Text style={s.title}>{contract.title}</Text>
          <Text style={s.meta}>
            Contrato n.º {String(contract.number).padStart(3, '0')} · {formatDate(contract.created_at)}
          </Text>
        </View>
        <View style={s.body}>
          <View style={s.parties}>
            <Party label="Prestador" party={provider} />
            <Party label="Cliente" party={client} />
          </View>
          {sections.map((section, i) => (
            <View key={i} wrap>
              <Text style={s.h2}>
                <Text style={s.num}>{i + 1}. </Text>
                {section.title}
              </Text>
              {section.body.split('\n').map((line, j) => (
                <Text key={j} style={s.line}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
          {contract.accepted_at ? (
            <View style={s.accepted} wrap={false}>
              <Text style={{ fontWeight: 700 }}>Aceite online pelo cliente</Text>
              <Text style={{ color: MUTED, marginTop: 2 }}>
                {contract.accepted_name} · {formatDateTime(contract.accepted_at)}
              </Text>
            </View>
          ) : (
            <View style={s.signatures} wrap={false}>
              <Text style={s.sign}>O prestador — {provider.name}</Text>
              <Text style={s.sign}>O cliente — {client.name}</Text>
            </View>
          )}
        </View>
        <View style={s.footer} fixed>
          <Text>{contract.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderContractPdf(contract: LeadContract): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ContractDocument contract={contract} />);
}
