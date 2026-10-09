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
