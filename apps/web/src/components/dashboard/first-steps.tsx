'use client';

/**
 * Primeiros passos: enquanto a plataforma está a ser montada (poucos leads),
 * mostra o que falta fazer para ela começar a trabalhar. Desaparece sozinho
 * quando os passos estão todos dados — ou quando se carrega em "Esconder".
 */

import { Check } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { Button, buttonClasses } from '@/components/ui/button';
import { useDicaFechada } from '@/components/ui/dica';
import { useMailAccount, useServices } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Acima disto a plataforma já está a ser usada: o cartão não volta a aparecer. */
const MAX_LEADS = 25;

export function FirstSteps({ leads, contacted }: { leads: number; contacted: number }) {
  const [escondido, esconder] = useDicaFechada('primeiros-passos');
  const { data: services } = useServices();
  const { data: mail, isLoading: mailLoading } = useMailAccount();

  const steps = [
    {
      key: 'leads',
      title: 'Trazer os teus leads',
      help: 'Importa uma folha de cálculo ou cria o primeiro à mão.',
      done: leads > 0,
      href: '/importar',
      action: 'Importar',
    },
    {
      key: 'servicos',
      title: 'Dizer o que vendes',
      help: 'Os serviços entram nas propostas, nos modelos de email e nas estatísticas.',
      done: (services?.length ?? 0) > 0,
      href: '/definicoes/servicos',
      action: 'Escolher serviços',
    },
    {
      key: 'email',
      title: 'Ligar o email de envio',
      help: 'Sem isto, os contactos e os follow-ups não saem da plataforma.',
      done: Boolean(mail),
      href: '/definicoes/email',
      action: 'Ligar o email',
    },
    {
      key: 'contacto',
      title: 'Fazer o primeiro contacto',
      help: 'Na Prospeção tens o email pronto a rever e a enviar.',
      done: contacted > 0,
      href: '/prospecao',
      action: 'Começar',
    },
  ];
  const done = steps.filter((s) => s.done).length;

  // Só enquanto a plataforma está a arrancar (e sem piscar antes de se saber do email).
  if (escondido || mailLoading || leads > MAX_LEADS || done === steps.length) return null;

  return (
    <Card>
      <CardHeader
        title="Primeiros passos"
        description={`${done} de ${steps.length} — o que falta para a plataforma começar a trabalhar por ti.`}
        actions={
          <Button size="sm" variant="ghost" onClick={esconder}>
            Esconder
          </Button>
        }
      />
      <ol className="divide-y divide-border">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
            <span
              aria-hidden
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                step.done ? 'border-success bg-success-soft text-success' : 'border-border-input text-muted',
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-medium', step.done && 'text-muted line-through')}>
                {step.title}
                <span className="sr-only">{step.done ? ' (feito)' : ''}</span>
              </span>
              {step.done ? null : <span className="block text-xs text-muted">{step.help}</span>}
            </span>
            {step.done ? null : (
              <Link href={step.href} className={buttonClasses('outline', 'sm', 'ml-auto')}>
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
