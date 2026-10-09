/**
 * Tokens pessoais de integração ("Authorization: Bearer vnd_…").
 * O token completo só existe no momento da criação; a base de dados guarda o
 * hash SHA-256 e um prefixo para o identificar na lista.
 */
import { API_TOKEN_PREFIX } from '@vndesign/core';
import { createHash, randomBytes } from 'node:crypto';

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = API_TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { token, prefix: token.slice(0, 12), hash: hashApiToken(token) };
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Formato válido: vnd_ + 43 carateres base64url. */
export function looksLikeApiToken(token: string): boolean {
  return /^vnd_[A-Za-z0-9_-]{43}$/.test(token);
}

