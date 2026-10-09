'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ServiceWorkerRegister } from './service-worker';
import { useTheme } from './theme';

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-right" closeButton richColors />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, error) =>
              count < 2 && !(error instanceof Error && 'status' in error && Number(error.status) < 500),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <ThemedToaster />
      <ServiceWorkerRegister />
    </QueryClientProvider>
  );
}
