'use client';

import { useEffect } from 'react';

/** Regista o service worker (PWA: instalação, página sem ligação e notificações push). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
