'use client';

import { ErrorView } from '@/components/layout/error-view';

/** Erro numa página da aplicação (o menu continua visível). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
