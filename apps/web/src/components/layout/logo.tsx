/** `mark`: só "VN" (barra lateral estreita do tablet), com o nome completo para quem usa leitor de ecrã. */
export function Logo({ className, mark }: { className?: string; mark?: boolean }) {
  if (mark) {
    return (
      <span data-logo className={`font-display text-lg font-bold tracking-tight ${className ?? ''}`}>
        <span className="text-accent">VN</span>
        <span className="sr-only">Design Leads</span>
      </span>
    );
  }
  return (
    // data-logo: o laranja do "VN" é a marca (os logótipos não têm requisito de contraste; o teste de acessibilidade ignora-o).
    <span data-logo className={`font-display text-lg font-bold tracking-tight ${className ?? ''}`}>
      <span className="text-accent">VN</span>Design{' '}
      <span className="font-semibold text-muted">Leads</span>
    </span>
  );
}
