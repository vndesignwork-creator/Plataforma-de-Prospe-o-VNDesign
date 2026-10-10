'use client';

import { ErrorView } from '@/components/layout/error-view';
import './globals.css';

/** Erro fora das páginas da aplicação (substitui o layout principal: precisa de <html> e <body>). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-PT" data-theme="dark">
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <ErrorView error={error} reset={reset} />
      </body>
    </html>
  );
}
