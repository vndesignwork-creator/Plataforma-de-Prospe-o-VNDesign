/** `narrow`: em ecrãs muito estreitos (< 400 px) "VNDesign L" (como o ícone), para caber o relógio do pomodoro na barra do telemóvel. */
export function Logo({ className, narrow }: { className?: string; narrow?: boolean }) {
  return (
    // data-logo: o laranja do "VN" é a marca (os logótipos não têm requisito de contraste; o teste de acessibilidade ignora-o).
    <span data-logo className={`font-display text-lg font-bold tracking-tight ${className ?? ''}`}>
      <span className="text-accent">VN</span>Design{' '}
      {/* Estreito: o "Leads" continua lá para os leitores de ecrã; à vista fica só o "L". */}
      <span className={`font-semibold text-muted ${narrow ? 'max-[399px]:sr-only' : ''}`}>Leads</span>
      {narrow ? (
        <span className="hidden font-semibold text-muted max-[399px]:inline" aria-hidden>
          L
        </span>
      ) : null}
    </span>
  );
}
