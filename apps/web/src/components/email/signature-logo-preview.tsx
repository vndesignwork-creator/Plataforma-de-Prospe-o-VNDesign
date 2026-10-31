'use client';

/**
 * O logótipo da assinatura dentro da caixa da mensagem (só para ver): aparece
 * quando a assinatura está no texto — a mesma regra do envio, que o junta logo
 * por baixo da última linha da assinatura.
 */
import { addSignatureLogo, emailBodyHtml, formatSignature } from '@vndesign/core';
import Link from 'next/link';
import { useSignature } from '@/lib/queries';

export function SignatureLogoPreview({ body }: { body: string }) {
  const { data: signature } = useSignature();
  if (!signature) return null;
  const text = formatSignature(signature);
  const hasSignature = !!text && addSignatureLogo(emailBodyHtml(body), text, { src: '', width: 1, alt: '' }) !== null;
  if (!hasSignature) return null;
  if (!signature.logo_url) {
    return (
      <p className="border-t border-dashed border-border px-3 py-2 text-xs text-muted">
        Podes juntar o teu logótipo por baixo da assinatura:{' '}
        <Link href="/definicoes/assinatura" className="text-accent-text underline underline-offset-2">
          adicionar logótipo
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 border-t border-dashed border-border px-3 py-2.5" data-testid="signature-logo-preview">
      <span className="inline-block w-fit max-w-full rounded bg-white p-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- link temporário do armazenamento */}
        <img src={signature.logo_url} alt="Logótipo da assinatura" style={{ width: signature.logo_width ?? 160 }} className="block h-auto max-w-full" />
      </span>
      <span className="text-xs text-muted">
        Logótipo da assinatura: vai logo por baixo da assinatura ao enviar pela plataforma (em “Copiar” e “Abrir no email” não vai).{' '}
        <Link href="/definicoes/assinatura" className="text-accent-text underline underline-offset-2">
          Mudar
        </Link>
      </span>
    </div>
  );
}
