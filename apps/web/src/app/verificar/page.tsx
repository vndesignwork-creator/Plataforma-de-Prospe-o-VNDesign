import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Logo } from '@/components/layout/logo';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = { title: 'Código de verificação' };

/** Segundo passo do login (verificação em dois passos ligada em Definições → Conta). */
export default function VerifyPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="text-2xl" />
          <h1 className="mt-6 text-2xl font-bold">Código de verificação</h1>
          <p className="mt-1 text-sm text-muted">Abre a app de autenticação (Google Authenticator, Microsoft Authenticator…) e escreve o código de 6 dígitos.</p>
        </div>
        <Suspense>
          <VerifyForm />
        </Suspense>
      </div>
    </main>
  );
}
