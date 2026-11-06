'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A ilustração do texto de persuasão: a versão larga (telemóvel, relatório, IAs e Google)
 * quando a moldura é bem larga; senão a do relatório ao centro (nada fica cortado).
 */
export function PromoImage({ alt }: { alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setWide(el.clientHeight > 0 && el.clientWidth / el.clientHeight >= 2.4);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    check();
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative aspect-[4/3] overflow-hidden rounded-2xl lg:aspect-auto lg:min-h-36 lg:flex-1 lg:basis-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- ilustração SVG estática */}
      <img
        src={wide ? '/analise/ilustracao-relatorio-larga.svg?v=1' : '/analise/ilustracao-relatorio.svg?v=3'}
        alt={alt}
        width={wide ? 1400 : 1000}
        height={500}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
