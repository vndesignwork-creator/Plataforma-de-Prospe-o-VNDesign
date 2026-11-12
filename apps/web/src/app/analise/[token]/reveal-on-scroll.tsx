'use client';

import { useEffect } from 'react';

type RevealEl = HTMLElement & { revealAnimating?: boolean };

/**
 * Página pública: cada elemento marcado com data-reveal-item sobe e aparece ao entrar no ecrã
 * (o "fadeInUp" do site: 1 s, ease), um a seguir ao outro — e volta a animar sempre que entra,
 * a descer ou a subir a página. O script do <head> já os escondeu (classe reveal-pending), para
 * não "piscarem" antes de animar.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('reveal-pending')) return;
    html.classList.add('reveal-ready');
    const hide = (el: RevealEl) => {
      el.classList.remove('is-in');
      el.style.removeProperty('--reveal-delay');
    };
    const outOfView = (el: HTMLElement) => {
      const b = el.getBoundingClientRect();
      return b.bottom <= 0 || b.top >= window.innerHeight;
    };
    const io = new IntersectionObserver(
      (entries) => {
        const shown: RevealEl[] = [];
        for (const e of entries) {
          const el = e.target as RevealEl;
          if (e.isIntersecting && e.intersectionRatio >= 0.1) {
            if (!el.classList.contains('is-in')) shown.push(el);
          } else if (!e.isIntersecting && el.classList.contains('is-in') && !el.revealAnimating) {
            // Saiu por completo do ecrã: fica escondido à espera da próxima entrada.
            hide(el);
          }
        }
        shown.forEach((el, i) => {
          el.style.setProperty('--reveal-delay', `${Math.min(i * 0.08, 0.6)}s`);
          el.revealAnimating = true;
          el.classList.add('is-in');
        });
      },
      { threshold: [0, 0.1], rootMargin: '0px 0px -5% 0px' },
    );
    // Durante a animação o elemento começa mais abaixo (pode estar "fora" por instantes):
    // só no fim se decide se saiu mesmo do ecrã.
    const onEnd = (ev: Event) => {
      const el = ev.currentTarget as RevealEl;
      if (ev.target !== el) return;
      el.revealAnimating = false;
      if (outOfView(el)) hide(el);
    };
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal-item]'));
    for (const el of items) {
      el.addEventListener('animationend', onEnd);
      el.addEventListener('animationcancel', onEnd);
      io.observe(el);
    }
    return () => {
      io.disconnect();
      for (const el of items) {
        el.removeEventListener('animationend', onEnd);
        el.removeEventListener('animationcancel', onEnd);
      }
    };
  }, []);
  return null;
}
