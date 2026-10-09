import type { Metadata } from 'next';
import { Logo } from '@/components/layout/logo';
import { RetryButton } from './retry-button';

export const metadata: Metadata = { title: 'Sem ligação' };

/** Mostrada pelo service worker quando não há rede (guardada em cache na instalação). */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Sem ligação à internet</h1>
      <p className="max-w-sm text-muted">
        A VNDesign Leads precisa de rede para mostrar os teus leads. Verifica o Wi-Fi ou os dados móveis e tenta outra vez.
      </p>
      <RetryButton />
    </main>
  );
}
