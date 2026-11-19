import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Logo } from '@/components/layout/logo';
import { NewPasswordForm } from './new-password-form';

export const metadata: Metadata = { title: 'Definir nova palavra-passe' };

/** Destino do link do email "Esqueci-me da palavra-passe". */
export default function NewPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="text-2xl" />
          <h1 className="mt-6 text-2xl font-bold">Nova palavra-passe</h1>
          <p className="mt-1 text-sm text-muted">Escolhe a palavra-passe com que vais entrar a partir de agora.</p>
        </div>
        <Suspense>
          <NewPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
