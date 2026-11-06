'use client';

import { useEffect } from 'react';

/** Dentro de uma moldura (?embed=1): diz ao site qual a altura, para a moldura crescer sem barra de deslocamento. */
export function EmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    // Mede o conteúdo (não a página): assim a moldura também encolhe, ex.: depois de enviar.
    const main = document.querySelector('main');
    if (!main) return;
    const send = () => window.parent.postMessage({ type: 'vnd-fa-height', height: Math.ceil(main.getBoundingClientRect().bottom + window.scrollY) }, '*');
    const observer = new ResizeObserver(send);
    observer.observe(main);
    send();
    return () => observer.disconnect();
  }, []);
  return null;
}
