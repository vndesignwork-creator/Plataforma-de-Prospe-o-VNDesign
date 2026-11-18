/**
 * Manual de marca do cliente (A4), gerado a partir do kit da marca: logótipos, cores (HEX, RGB e
 * CMYK), tipos de letra e as regras de uso. Usa a cor principal do cliente (não a da VNDesign):
 * é um documento dele.
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { colorCodes, formatDate, hexToRgb } from '@vndesign/core';
import { LINE, MUTED, registerFonts } from '../proposals/pdf';

export interface BrandManualData {
  company: string;
  colors: { name: string; hex: string }[];
  fonts: { name: string; usage: string }[];
  /** Imagens dos logótipos (PNG ou JPEG; o react-pdf não lê SVG nem WebP). */
  logos: { name: string; data: Buffer; format: 'png' | 'jpg' }[];
  /** Outros ficheiros do kit que não entram como imagem (SVG, PDF…): só o nome. */
  otherFiles: string[];
  preparedBy: { name: string; company: string | null; email: string | null; website: string | null };
  today: string;
}

export const BRAND_RULES = [
  'Deixa sempre espaço livre à volta do logótipo (pelo menos a altura da letra maior).',
  'Não estiques, não deformes nem rodes o logótipo.',
  'Não mudes as cores do logótipo: usa as versões do kit (cores, a preto e a branco).',
  'Sobre fundos escuros ou fotografias, usa a versão clara; sobre fundos claros, a versão escura.',
  'Não acrescentes sombras, contornos ou efeitos.',
  'Em tamanhos pequenos (redes sociais, ícone do site), usa a versão mais simples.',
  'Para impressão, confirma as cores CMYK com a gráfica (os valores aqui são aproximados).',
];

/** Texto legível sobre uma cor (preto ou branco, o que tiver mais contraste). */
function inkOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#141414';
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#141414' : '#ffffff';
}

const s = StyleSheet.create({
  page: { fontFamily: 'Jakarta', fontSize: 10, color: '#141414', paddingBottom: 56, paddingHorizontal: 44, paddingTop: 40 },
  cover: { fontFamily: 'Jakarta', color: '#141414', padding: 0 },
  coverBand: { height: 14 },
  coverBody: { flexGrow: 1, paddingHorizontal: 56, paddingTop: 120 },
  coverKicker: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: MUTED },
  coverTitle: { fontFamily: 'Syne', fontWeight: 800, fontSize: 38, marginTop: 10, lineHeight: 1.15 },
  coverLogo: { marginTop: 60, maxHeight: 170, maxWidth: 320, objectFit: 'contain' },
  coverFoot: { paddingHorizontal: 56, paddingBottom: 40, fontSize: 9, color: MUTED },
  h2: { fontFamily: 'Syne', fontWeight: 800, fontSize: 18, marginBottom: 4 },
  lead: { fontSize: 10, color: MUTED, marginBottom: 16 },
  section: { marginBottom: 26 },
  logos: { flexDirection: 'row', flexWrap: 'wrap' },
  logoBox: { width: 240, height: 150, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 14, marginRight: 12, marginBottom: 12, justifyContent: 'center', alignItems: 'center' },
  logoImg: { maxWidth: 210, maxHeight: 100, objectFit: 'contain' },
  logoName: { fontSize: 8, color: MUTED, marginTop: 8, textAlign: 'center' },
  colors: { flexDirection: 'row', flexWrap: 'wrap' },
  color: { width: 156, marginRight: 12, marginBottom: 14, borderWidth: 1, borderColor: LINE, borderRadius: 8, overflow: 'hidden' },
  swatch: { height: 78, padding: 8, justifyContent: 'flex-end' },
  swatchName: { fontWeight: 700, fontSize: 10 },
  codes: { padding: 8 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 8.5, marginBottom: 2 },
  codeLabel: { color: MUTED },
  font: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 8 },
  fontName: { fontWeight: 700, fontSize: 12 },
  fontUsage: { color: MUTED },
  rule: { flexDirection: 'row', marginBottom: 7 },
  ruleDot: { width: 14, fontWeight: 700 },
  ruleText: { flex: 1 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

function BrandManual(d: BrandManualData) {
  const accent = d.colors[0]?.hex ?? '#141414';
  const by = [d.preparedBy.company ?? d.preparedBy.name, d.preparedBy.website, d.preparedBy.email].filter(Boolean).join(' · ');
  return (
    <Document title={`Manual de marca — ${d.company}`} author={d.preparedBy.company ?? d.preparedBy.name} language="pt-PT">
      <Page size="A4" style={s.cover}>
        <View style={[s.coverBand, { backgroundColor: accent }]} />
        <View style={s.coverBody}>
          <Text style={s.coverKicker}>Manual de marca</Text>
          <Text style={s.coverTitle}>{d.company}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- imagem de um PDF (o react-pdf não tem alt) */}
          {d.logos[0] ? <Image style={s.coverLogo} src={{ data: d.logos[0].data, format: d.logos[0].format }} /> : null}
        </View>
        <View style={s.coverFoot}>
          <Text>
            {formatDate(d.today)}
            {by ? ` · Preparado por ${by}` : ''}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <View style={s.footer} fixed>
          <Text>Manual de marca · {d.company}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Logótipo</Text>
          <Text style={s.lead}>As versões do logótipo. Usa sempre os ficheiros originais do kit (não copies a imagem deste documento).</Text>
          {d.logos.length ? (
            <View style={s.logos}>
              {d.logos.map((logo, i) => (
                <View key={i} style={s.logoBox} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- imagem de um PDF (o react-pdf não tem alt) */}
                  <Image style={s.logoImg} src={{ data: logo.data, format: logo.format }} />
                  <Text style={s.logoName}>{logo.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.fontUsage}>Os logótipos estão nos ficheiros do kit{d.otherFiles.length ? `: ${d.otherFiles.slice(0, 6).join(', ')}` : '.'}</Text>
          )}
          {d.logos.length && d.otherFiles.length ? <Text style={[s.fontUsage, { marginTop: 4 }]}>Outros ficheiros do kit: {d.otherFiles.slice(0, 8).join(', ')}.</Text> : null}
        </View>

        {d.colors.length ? (
          <View style={s.section}>
            <Text style={s.h2}>Cores</Text>
            <Text style={s.lead}>HEX e RGB para o ecrã (site, redes sociais); CMYK para impressão.</Text>
            <View style={s.colors}>
              {d.colors.map((c, i) => {
                const codes = colorCodes(c.hex);
                return (
                  <View key={i} style={s.color} wrap={false}>
                    <View style={[s.swatch, { backgroundColor: c.hex }]}>
                      <Text style={[s.swatchName, { color: inkOn(c.hex) }]}>{c.name || `Cor ${i + 1}`}</Text>
                    </View>
                    {codes ? (
                      <View style={s.codes}>
                        <View style={s.codeRow}>
                          <Text style={s.codeLabel}>HEX</Text>
                          <Text>{codes.hex}</Text>
                        </View>
                        <View style={s.codeRow}>
                          <Text style={s.codeLabel}>RGB</Text>
                          <Text>{codes.rgb}</Text>
                        </View>
                        <View style={s.codeRow}>
                          <Text style={s.codeLabel}>CMYK</Text>
                          <Text>{codes.cmyk}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {d.fonts.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Tipos de letra</Text>
            <Text style={s.lead}>Os tipos de letra da marca e onde usar cada um.</Text>
            {d.fonts.map((f, i) => (
              <View key={i} style={s.font}>
                <Text style={s.fontName}>{f.name}</Text>
                <Text style={s.fontUsage}>{f.usage || '—'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Regras de uso</Text>
          <Text style={s.lead}>Para a marca parecer sempre a mesma, em todo o lado.</Text>
          {BRAND_RULES.map((rule, i) => (
            <View key={i} style={s.rule}>
              <Text style={[s.ruleDot, { color: accent }]}>•</Text>
              <Text style={s.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/**
 * Gera o PDF. Uma imagem estragada pode prender o react-pdf: com um limite de tempo, e se as
 * imagens falharem o manual sai sem elas (os logótipos ficam nos ficheiros do kit).
 */
export async function renderBrandManualPdf(data: BrandManualData, timeoutMs = 20_000): Promise<Buffer> {
  registerFonts();
  if (!data.logos.length) return renderToBuffer(<BrandManual {...data} />);
  try {
    return await withTimeout(renderToBuffer(<BrandManual {...data} />), timeoutMs);
  } catch (error) {
    console.warn('[manual de marca] sem as imagens dos logótipos:', error instanceof Error ? error.message : error);
    return renderToBuffer(<BrandManual {...data} logos={[]} otherFiles={[...data.logos.map((l) => l.name), ...data.otherFiles]} />);
  }
}
