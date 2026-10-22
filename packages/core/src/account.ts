/**
 * Conta: sessões abertas (Definições → Conta) e a descrição do aparelho a
 * partir do "user agent" do browser.
 */
import { z } from 'zod';

export const UserSessionSchema = z
  .object({
    id: z.uuid(),
    created_at: z.string(),
    last_active_at: z.string().nullable(),
    device: z.string().meta({ description: 'Ex.: "Chrome no Android"' }),
    ip: z.string().nullable(),
    verified: z.boolean().meta({ description: 'Entrou com o código da verificação em dois passos' }),
    current: z.boolean(),
  })
  .meta({ id: 'UserSession' });
export type UserSession = z.infer<typeof UserSessionSchema>;

/** "Mozilla/5.0 (iPhone; …) … Safari/…" → "Safari no iPhone". */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Aparelho desconhecido';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : /node|undici|axios|curl|okhttp|Dart|Expo/i.test(ua)
                ? 'App ou integração'
                : null;
  if (browser && os) return `${browser} no ${os}`;
  return browser ?? os ?? 'Aparelho desconhecido';
}
