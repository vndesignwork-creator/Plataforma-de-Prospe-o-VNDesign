import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Logo } from '@/components/layout/logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="text-2xl" />
          <h1 className="mt-6 text-2xl font-bold">Entrar</h1>
          <p className="mt-1 text-sm text-muted">Prospeção de clientes VNDesign</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
