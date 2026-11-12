'use client';

import { useEffect } from 'react';

/**
 * Página pública: cada elemento marcado com data-reveal-item sobe e aparece ao entrar no ecrã
 * (o "fadeInUp" do site: 1 s, ease), um a seguir ao outro. O script do <head> da página já os
 * escondeu (classe reveal-pending), para não "piscarem" antes de animar.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('reveal-pending')) return;
    html.classList.add('reveal-ready');
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        shown.forEach((el, i) => {
          el.style.setProperty('--reveal-delay', `${Math.min(i * 0.08, 0.6)}s`);
          el.classList.add('is-in');
          io.unobserve(el);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -5% 0px' },
    );
    document.querySelectorAll('[data-reveal-item]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
