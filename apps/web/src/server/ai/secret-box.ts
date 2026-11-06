/**
 * Cifra das chaves de IA guardadas na base de dados (AES-256-GCM).
 * A chave de cifra vem de AI_KEYS_SECRET ou, se não existir, da SUPABASE_SECRET_KEY
 * (HKDF). Se essa chave mudar, as chaves guardadas deixam de abrir e é preciso
 * voltar a colá-las em Definições → Inteligência artificial.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

function masterKey(): Buffer {
  const secret = process.env.AI_KEYS_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Falta AI_KEYS_SECRET (ou SUPABASE_SECRET_KEY) no servidor para cifrar as chaves de IA.');
  return Buffer.from(hkdfSync('sha256', secret, 'vndesign-leads', 'ai-provider-keys', 32));
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

/** null se não abrir (chave de cifra mudou ou texto adulterado). */
export function openSecret(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** "…a1b2" — só para reconhecer a chave, sem a revelar. */
export function keyHint(key: string): string {
  return `…${key.slice(-4)}`;
}

/** Assina um valor curto (ex.: "leadId.momento"): `valor.assinatura`, para ligações públicas que não se podem adivinhar. */
function signingKey(purpose: string): Buffer {
  const secret = process.env.AI_KEYS_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Falta AI_KEYS_SECRET (ou SUPABASE_SECRET_KEY) no servidor.');
  return Buffer.from(hkdfSync('sha256', secret, 'vndesign-leads', `sign:${purpose}`, 32));
}

export function signValue(value: string, purpose: string): string {
  const mac = createHmac('sha256', signingKey(purpose)).update(value).digest('base64url').slice(0, 22);
  return `${Buffer.from(value).toString('base64url')}.${mac}`;
}

/** O valor assinado, ou null se a assinatura não bater certo. */
export function verifySigned(signed: string, purpose: string): string | null {
  const [encoded, mac] = signed.split('.');
  if (!encoded || !mac) return null;
  const value = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = createHmac('sha256', signingKey(purpose)).update(value).digest('base64url').slice(0, 22);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}
