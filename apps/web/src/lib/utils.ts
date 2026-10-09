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
