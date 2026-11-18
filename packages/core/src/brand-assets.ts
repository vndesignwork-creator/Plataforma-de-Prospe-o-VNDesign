/**
 * Ferramentas do kit da marca: os códigos de cada cor (HEX, RGB e CMYK, para o manual de marca),
 * as cores principais de um logótipo (lidas no próprio browser, sem IA) e o conteúdo dos códigos QR
 * do cliente (site, avaliação no Google, WhatsApp, Wi-Fi).
 */
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Cores
// -----------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** CMYK aproximado (para impressão confirma-se sempre com a gráfica). */
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - rr - k) / (1 - k);
  const m = (1 - gg - k) / (1 - k);
  const y = (1 - bb - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)) as [number, number, number, number];
}

/** Os códigos de uma cor, como aparecem no manual de marca. */
export function colorCodes(hex: string): { hex: string; rgb: string; cmyk: string } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const cmyk = rgbToCmyk(...rgb);
  return { hex: rgbToHex(...rgb).toUpperCase(), rgb: rgb.join(', '), cmyk: cmyk.join(', ') };
}

const distance = (a: [number, number, number], b: [number, number, number]) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/**
 * As cores principais de uma imagem (os píxeis RGBA de um canvas): agrupa as parecidas, ignora o
 * transparente e devolve as mais usadas, da mais para a menos (no máximo `max`). O branco e o
 * preto quase puros só entram se forem a maior parte da imagem (costumam ser o fundo ou o contorno).
 */
export function extractPalette(pixels: ArrayLike<number>, max = 6): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  // Uma amostra por cada ~4 píxeis chega para um logótipo e mantém-se rápido em imagens grandes.
  const step = pixels.length > 4 * 250_000 ? 16 : 4;
  for (let i = 0; i + 3 < pixels.length; i += step) {
    const a = pixels[i + 3]!;
    if (a < 128) continue;
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
    total++;
  }
  if (!total) return [];
  const ranked = [...buckets.values()]
    .map((b) => ({ n: b.n, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number] }))
    .sort((a, b) => b.n - a.n);
  const chosen: { n: number; rgb: [number, number, number] }[] = [];
  for (const c of ranked) {
    // Cores muito parecidas contam como uma (o anti-aliasing cria tons intermédios).
    const same = chosen.find((x) => distance(x.rgb, c.rgb) < 48);
    if (same) {
      same.n += c.n;
      continue;
    }
    chosen.push({ ...c });
  }
  const isNeutralEdge = (rgb: [number, number, number]) => rgb.every((v) => v > 240) || rgb.every((v) => v < 18);
  return chosen
    .filter((c) => c.n / total >= 0.01)
    .filter((c) => !isNeutralEdge(c.rgb) || c.n / total >= 0.35)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => rgbToHex(...c.rgb));
}

// -----------------------------------------------------------------------------
// Códigos QR do cliente
// -----------------------------------------------------------------------------

export const QR_KINDS = ['url', 'review', 'whatsapp', 'wifi', 'text'] as const;
export type QrKind = (typeof QR_KINDS)[number];
export const QR_KIND_LABELS: Record<QrKind, string> = {
  url: 'Site ou link',
  review: 'Avaliação no Google',
  whatsapp: 'WhatsApp',
  wifi: 'Rede Wi-Fi',
  text: 'Texto livre',
};

export const QrInputSchema = z.object({
  kind: z.enum(QR_KINDS),
  /** Link, telefone (WhatsApp) ou texto. */
  value: z.string().trim().max(1000).default(''),
  /** WhatsApp: a mensagem que já vem escrita. */
  message: z.string().trim().max(500).default(''),
  ssid: z.string().trim().max(64).default(''),
  password: z.string().max(64).default(''),
  security: z.enum(['WPA', 'WEP', 'nopass']).default('WPA'),
});
export type QrInput = z.input<typeof QrInputSchema>;

/** Link do WhatsApp (como o botão da ficha: em Portugal, só telemóveis 9xx; com + ou 00, qualquer país). */
function waLink(phone: string, text?: string): string | null {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // já com indicativo
  } else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^9\d{8}$/.test(digits)) digits = `351${digits}`;
  else if (!/^3519\d{8}$/.test(digits)) return null;
  if (digits.startsWith('351') && !/^3519\d{8}$/.test(digits)) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}${text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : ''}`;
}

// Caracteres com significado no formato Wi-Fi (escapam-se com \).
const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

/** O que o código QR leva (null + motivo quando falta alguma coisa). */
export function qrPayload(input: QrInput): { text: string } | { error: string } {
  const q = QrInputSchema.parse(input);
  switch (q.kind) {
    case 'url':
    case 'review': {
      const v = q.value.trim();
      if (!v) return { error: q.kind === 'review' ? 'Cola o link para avaliação no Google.' : 'Escreve o endereço.' };
      const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      try {
        new URL(url);
      } catch {
        return { error: 'Endereço inválido.' };
      }
      return { text: url };
    }
    case 'whatsapp': {
      const url = waLink(q.value, q.message || undefined);
      return url ? { text: url } : { error: 'Telefone inválido (ex.: 912 345 678).' };
    }
    case 'wifi':
      if (!q.ssid) return { error: 'Escreve o nome da rede.' };
      if (q.security !== 'nopass' && !q.password) return { error: 'Escreve a palavra-passe da rede (ou escolhe "Sem palavra-passe").' };
      return { text: `WIFI:T:${q.security};S:${wifiEscape(q.ssid)};${q.security === 'nopass' ? '' : `P:${wifiEscape(q.password)};`};` };
    case 'text':
      return q.value ? { text: q.value } : { error: 'Escreve o texto.' };
  }
}

/** Nome do ficheiro do código QR ("qr-site-padaria-sol.png"). */
export function qrFileName(kind: QrKind, company: string, ext: 'png' | 'svg'): string {
  const slug = company
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const what = { url: 'site', review: 'avaliacao', whatsapp: 'whatsapp', wifi: 'wifi', text: 'texto' }[kind];
  return `qr-${what}${slug ? `-${slug}` : ''}.${ext}`;
}
