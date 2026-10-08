import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Domínio legível de um URL ("https://www.sfraa.pt/" → "sfraa.pt"). */
export function displayHost(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return path && /facebook|instagram|linkedin|restaurantguru|sluurpy|wanderlog/.test(host)
      ? `${host}${path.length > 24 ? `${path.slice(0, 24)}…` : path}`
      : host;
  } catch {
    return url;
  }
}
