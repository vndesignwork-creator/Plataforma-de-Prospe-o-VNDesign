import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-5xl font-bold text-accent-text">404</p>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <Link href="/leads" className={buttonClasses('outline')}>
        Voltar aos leads
      </Link>
    </main>
  );
}
