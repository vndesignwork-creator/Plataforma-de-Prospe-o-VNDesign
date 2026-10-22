/**
 * Relatório de diagnóstico do site (A4, para o cliente) a partir da última
 * análise: velocidade, telemóvel, segurança, os 3 problemas principais com o
 * porquê, as imagens do site no computador e no telemóvel (se houver) e o que a
 * VNDesign propõe. Mesma identidade do PDF das propostas.
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import {
  AUDIT_ISSUE_IMPACT,
  AUDIT_SEVERITY_LABELS,
  formatDate,
  formatSignature,
  topAuditIssues,
  type ServiceInfo,
  type Signature,
  type SiteAudit,
} from '@vndesign/core';
import { ACCENT, INK, LINE, MUTED, SOFT, registerFonts } from './pdf';

const GOOD = '#2f9e6a';
const WARN = '#c98a12';
const BAD = '#d6453d';

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 10, color: INK, paddingBottom: 56 },
  header: { backgroundColor: '#0d0d0d', color: '#f5f2ed', paddingHorizontal: 40, paddingTop: 26, paddingBottom: 22 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { fontFamily: 'Syne', fontWeight: 800, fontSize: 20 },
  logoAccent: { color: ACCENT },
  headerMeta: { fontSize: 9, color: '#a9a59c', textAlign: 'right' },
  headerMetaStrong: { color: '#f5f2ed', fontWeight: 700, fontSize: 10 },
  title: { fontFamily: 'Syne', fontWeight: 800, fontSize: 18, marginTop: 18, lineHeight: 1.2 },
  forLine: { fontSize: 10, color: '#d8d4cc', marginTop: 6 },
  body: { paddingHorizontal: 40, paddingTop: 18 },
  h2: { fontFamily: 'Syne', fontWeight: 700, fontSize: 13, marginBottom: 7, marginTop: 14 },
  paragraph: { marginBottom: 7 },
  tiles: { flexDirection: 'row', marginHorizontal: -4 },
  tile: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10, marginHorizontal: 4 },
  tileLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  tileValue: { fontWeight: 800, fontSize: 15, marginTop: 4 },
  tileNote: { fontSize: 8, color: MUTED, marginTop: 2 },
  issue: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 3, marginBottom: 8 },
  issueHead: { flexDirection: 'row', alignItems: 'center' },
  issueTag: { fontSize: 7.5, fontWeight: 700, color: '#ffffff', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.5, marginRight: 7 },
  issueTitle: { fontWeight: 700, fontSize: 11, flex: 1 },
  issueWhy: { color: MUTED, marginTop: 3 },
  service: { flexDirection: 'row', marginTop: 4 },
  bullet: { width: 5, height: 5, backgroundColor: ACCENT, borderRadius: 1, marginTop: 4.5, marginRight: 7 },
  box: { backgroundColor: SOFT, borderRadius: 6, padding: 11, marginTop: 14 },
  boxTitle: { fontFamily: 'Syne', fontWeight: 700, fontSize: 12, marginBottom: 4 },
  signature: { marginTop: 12 },
  shots: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  shot: { borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 4, marginRight: 10 },
  shotLabel: { fontSize: 8, color: MUTED, marginTop: 4, textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

export interface DiagnosisPdfData {
  audit: SiteAudit;
  lead: { company_name: string; contact_name: string | null; city: string | null; approach_angle: string | null; services: string[] };
  services: readonly ServiceInfo[];
  signature: Signature;
  /** Imagens do site (PageSpeed): no computador e no telemóvel. */
  screenshots?: { device: 'mobile' | 'desktop'; buffer: Buffer; contentType: string; width: number | null; height: number | null }[];
}

/** Altura comum das imagens; a largura segue a proporção de cada uma. */
const SHOT_HEIGHT = 210;
const SHOT_FALLBACK = { mobile: [412, 823], desktop: [1350, 940] } as const;

const bareHost = (url: string | null) => (url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null);
const SEVERITY_COLOR = { high: BAD, medium: WARN, low: MUTED } as const;

function tiles(audit: SiteAudit) {
  const ps = audit.pagespeed_mobile;
  const mobile =
    audit.suggested_mobile === 'sim' || (audit.has_viewport && !audit.zoom_blocked)
      ? { value: 'Adaptado', color: GOOD }
      : audit.suggested_mobile === 'parcial' || audit.zoom_blocked
        ? { value: 'Parcial', color: WARN }
        : audit.has_viewport === false || audit.suggested_mobile === 'nao'
          ? { value: 'Não adaptado', color: BAD }
          : { value: '—', color: MUTED };
  const security =
    audit.https === false
      ? { value: 'Sem HTTPS', color: BAD, note: 'O browser mostra “Não seguro”' }
      : audit.ssl_valid === false
        ? { value: 'Certificado inválido', color: BAD, note: audit.ssl_error ?? undefined }
        : audit.https
          ? { value: 'Seguro', color: GOOD, note: 'HTTPS com certificado válido' }
          : { value: '—', color: MUTED, note: undefined };
  return [
    {
      label: 'Velocidade (telemóvel)',
      value: ps === null ? '—' : `${ps}/100`,
      color: ps === null ? MUTED : ps < 50 ? BAD : ps < 90 ? WARN : GOOD,
      note: ps === null ? 'Não medida' : ps < 50 ? 'Lento' : ps < 90 ? 'Pode melhorar' : 'Rápido',
    },
    { label: 'Telemóvel', value: mobile.value, color: mobile.color, note: undefined },
    { label: 'Segurança', ...security },
    {
      label: 'Resposta do servidor',
      value: audit.response_ms === null ? '—' : `${(audit.response_ms / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} s`,
      color: audit.response_ms === null ? MUTED : audit.response_ms > 1500 ? WARN : GOOD,
      note: audit.cms ?? undefined,
    },
  ];
}

function DiagnosisDocument({ audit, lead, services, signature, screenshots = [] }: DiagnosisPdfData) {
  const company = signature.company || 'VNDesign';
  const contactLine = [signature.full_name, signature.phone, signature.email, bareHost(signature.website)].filter(Boolean).join(' · ');
  const analysed = audit.created_at.slice(0, 10);
  const issues = topAuditIssues(audit.issues, 3);
  const offered = lead.services
    .map((key) => services.find((s) => s.key === key))
    .filter((s): s is ServiceInfo => !!s && !s.archived_at);
  const url = bareHost(audit.final_url ?? audit.url);

  return (
    <Document
      title={`Diagnóstico do site — ${lead.company_name}`}
      author={signature.full_name || company}
      creator="VNDesign Leads"
      producer="VNDesign Leads"
      language="pt-PT"
    >
      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text>{contactLine || company}</Text>
          <Text render={({ pageNumber, totalPages }) => `Diagnóstico de ${formatDate(analysed)} · ${pageNumber}/${totalPages}`} />
        </View>
        <View style={s.header}>
          <View style={s.headerRow}>
            <Text style={s.logo}>
              <Text style={s.logoAccent}>VN</Text>Design
            </Text>
            <View>
              <Text style={s.headerMeta}>
                <Text style={s.headerMetaStrong}>Diagnóstico do site</Text>
              </Text>
              <Text style={s.headerMeta}>{formatDate(analysed)}</Text>
            </View>
          </View>
          <Text style={s.title}>Diagnóstico do site da {lead.company_name}</Text>
          <Text style={s.forLine}>
            {url ?? 'Sem site próprio'}
            {lead.city ? ` · ${lead.city}` : ''}
          </Text>
        </View>

        <View style={s.body}>
          <Text style={s.paragraph}>
            {lead.contact_name ? `${lead.contact_name}, analisei` : 'Analisei'} o vosso site com as mesmas ferramentas que o Google usa. Este
            é o resumo do que encontrei e do que faria para trazer mais clientes através dele.
          </Text>

          <Text style={s.h2}>Resumo</Text>
          <View style={s.tiles}>
            {tiles(audit).map((t) => (
              <View key={t.label} style={s.tile}>
                <Text style={s.tileLabel}>{t.label}</Text>
                <Text style={[s.tileValue, { color: t.color }]}>{t.value}</Text>
                {t.note ? <Text style={s.tileNote}>{t.note}</Text> : null}
              </View>
            ))}
          </View>

          {screenshots.length ? (
            <View wrap={false}>
              <Text style={s.h2}>Como o site aparece hoje</Text>
              <View style={s.shots}>
                {[...screenshots]
                  .sort((a) => (a.device === 'desktop' ? -1 : 1))
                  .map((shot) => {
                    const [w, h] = shot.width && shot.height ? [shot.width, shot.height] : SHOT_FALLBACK[shot.device];
                    const width = Math.min(Math.round((SHOT_HEIGHT * w) / h), 330);
                    return (
                      <View key={shot.device} style={s.shot}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- imagem de um PDF (o react-pdf não tem alt) */}
                        <Image
                          src={{ data: shot.buffer, format: shot.contentType.includes('png') ? 'png' : 'jpg' }}
                          style={{ width, height: Math.round((width * h) / w), objectFit: 'cover' }}
                        />
                        <Text style={s.shotLabel}>{shot.device === 'desktop' ? 'No computador' : 'No telemóvel'}</Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          ) : null}

          <Text style={s.h2}>{issues.length ? 'Os problemas principais' : 'Problemas'}</Text>
          {issues.length ? (
            issues.map((issue) => (
              <View key={issue.code} style={[s.issue, { borderLeftColor: SEVERITY_COLOR[issue.severity] }]} wrap={false}>
                <View style={s.issueHead}>
                  <Text style={[s.issueTag, { backgroundColor: SEVERITY_COLOR[issue.severity] }]}>
                    {AUDIT_SEVERITY_LABELS[issue.severity].toUpperCase()}
                  </Text>
                  <Text style={s.issueTitle}>{issue.message}</Text>
                </View>
                <Text style={s.issueWhy}>{AUDIT_ISSUE_IMPACT[issue.code]}</Text>
              </View>
            ))
          ) : (
            <Text style={s.paragraph}>Não encontrei problemas graves: o site está numa boa base.</Text>
          )}
          {audit.issues.length > issues.length ? (
            <Text style={{ color: MUTED, fontSize: 9 }}>
              Encontrei mais {audit.issues.length - issues.length} ponto{audit.issues.length - issues.length === 1 ? '' : 's'} a melhorar, que posso
              mostrar numa conversa.
            </Text>
          ) : null}

          <Text style={s.h2}>O que proponho</Text>
          {lead.approach_angle ? <Text style={s.paragraph}>{lead.approach_angle}</Text> : null}
          {offered.length ? (
            offered.map((svc) => (
              <View key={svc.key} style={s.service}>
                <View style={s.bullet} />
                <Text style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 700 }}>{svc.label}</Text>
                  {svc.value_phrase ? ` — ${svc.value_phrase}` : ''}
                </Text>
              </View>
            ))
          ) : !lead.approach_angle ? (
            <Text style={s.paragraph}>
              Corrigir os pontos acima: um site rápido, seguro e fácil de usar no telemóvel, para quem vos encontra no Google vos contactar.
            </Text>
          ) : null}

          <View style={s.box} wrap={false}>
            <Text style={s.boxTitle}>Próximo passo</Text>
            <Text>
              Se fizer sentido, mostro-lhe numa conversa de 15 minutos como resolver estes pontos — sem compromisso. Basta responder ao
              email ou ligar-me.
            </Text>
          </View>

          <View style={s.signature} wrap={false}>
            <Text style={{ color: MUTED }}>Com os melhores cumprimentos,</Text>
            <Text style={{ fontWeight: 700, marginTop: 4 }}>{signature.full_name || company}</Text>
            <Text style={{ color: MUTED }}>{formatSignature(signature).split('\n').slice(1).join('\n')}</Text>
          </View>
          <Text style={{ color: MUTED, fontSize: 7, marginTop: 10 }}>
            Análise automática feita a {formatDate(analysed)} com dados públicos do site (incluindo o Google PageSpeed Insights). Os
            valores podem variar ligeiramente de medição para medição.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDiagnosisPdf(data: DiagnosisPdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<DiagnosisDocument {...data} />);
}
