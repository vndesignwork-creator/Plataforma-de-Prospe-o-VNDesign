/** Foto circular de uma pessoa; sem foto (ou se não carregar), as iniciais. */
'use client';

import { initials } from '@vndesign/core';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function Avatar({ name, url, size = 36, className }: { name: string; url: string | null | undefined; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url && broken !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento (não passa pelo otimizador de imagens)
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={style}
        onError={() => setBroken(url)}
        className={cn('shrink-0 rounded-full border border-border object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-text select-none', className)}
    >
      {initials(name)}
    </span>
  );
}
