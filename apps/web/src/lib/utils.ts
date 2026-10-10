import { ensureUrlProtocol, isSocialOrDirectoryUrl } from '@vndesign/core';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Domínio legível de um URL ("https://www.sfraa.pt/" → "sfraa.pt"). */
export function displayHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(ensureUrlProtocol(url));
    const host = u.hostname.replace(/^www\./, '');
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, '');
    // Em redes sociais e diretórios o domínio não diz qual é a empresa: mostra também o caminho.
    return path && isSocialOrDirectoryUrl(u.href) ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

/**
 * Caminho interno seguro para onde voltar depois do login (?next=…).
 * Recusa endereços que o browser resolveria para outro site
 * (ex.: "//mal.pt", "/\mal.pt", "/\t/mal.pt").
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next?.startsWith('/')) return fallback;
  try {
    const base = 'https://interno.invalid';
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Ligação do WhatsApp para um telefone (ou null se não parecer telemóvel).
 * Números portugueses sem indicativo: só os móveis (9xx xxx xxx) — os fixos não
 * têm WhatsApp. Com "+" ou "00" à frente, aceita qualquer país.
 */
export function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // já com indicativo
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (/^9\d{8}$/.test(digits)) {
    digits = `351${digits}`;
  } else if (!/^3519\d{8}$/.test(digits)) {
    return null;
  }
  if (digits.startsWith('351') && !/^3519\d{8}$/.test(digits)) return null;
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** "21 625 0897" → "tel:216250897" (mantém o "+" do indicativo). */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
